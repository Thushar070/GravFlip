// @license PROPRIETARY

import { DB } from '../../lib/db.js';
import { rateLimit, corsHeaders } from '../../lib/rateLimit.js';

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — Fetch friends lists with details resolved
  if (req.method === 'GET') {
    const { allowed } = await rateLimit(req, 'list_friends', 40, 60);
    if (!allowed) return res.status(429).json({ error: 'Too many requests' });

    const { id } = req.query || {};
    if (!id) return res.status(400).json({ error: 'Missing profile ID' });

    const profile = await DB.getProfile(id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const resolveList = async (ids) => {
      const list = [];
      for (const pId of ids || []) {
        const p = await DB.getProfile(pId);
        if (p) {
          list.push({
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            activeBadge: p.activeBadge,
            highScore: p.records?.classic?.score || 0
          });
        }
      }
      return list;
    };

    const friends = await resolveList(profile.friends);
    const sent = await resolveList(profile.friendRequestsSent);
    const received = await resolveList(profile.friendRequestsReceived);

    return res.status(200).json({ friends, sent, received });
  }

  // POST — Send/Accept/Decline/Remove friends action
  if (req.method === 'POST') {
    const { allowed } = await rateLimit(req, 'action_friends', 20, 60);
    if (!allowed) return res.status(429).json({ error: 'Too many requests' });

    const { id, action, targetId, targetUsername } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing profile ID' });
    if (!action) return res.status(400).json({ error: 'Missing action' });

    const sender = await DB.getProfile(id);
    if (!sender) return res.status(404).json({ error: 'Sender profile not found' });

    let finalTargetId = targetId;
    if (targetUsername) {
      finalTargetId = await DB.getProfileIdByUsername(targetUsername);
    }

    if (!finalTargetId) {
      return res.status(404).json({ error: 'Target profile not found' });
    }

    if (finalTargetId === id) {
      return res.status(400).json({ error: 'Cannot perform social action on yourself' });
    }

    const target = await DB.getProfile(finalTargetId);
    if (!target) return res.status(404).json({ error: 'Target profile not found' });

    sender.friends = sender.friends || [];
    sender.friendRequestsSent = sender.friendRequestsSent || [];
    sender.friendRequestsReceived = sender.friendRequestsReceived || [];
    target.friends = target.friends || [];
    target.friendRequestsSent = target.friendRequestsSent || [];
    target.friendRequestsReceived = target.friendRequestsReceived || [];

    if (action === 'request') {
      if (sender.friends.includes(finalTargetId)) {
        return res.status(400).json({ error: 'Already friends' });
      }
      if (sender.friendRequestsSent.includes(finalTargetId)) {
        return res.status(400).json({ error: 'Friend request already sent' });
      }
      if (sender.friendRequestsReceived.includes(finalTargetId)) {
        sender.friends.push(finalTargetId);
        sender.friendRequestsReceived = sender.friendRequestsReceived.filter(x => x !== finalTargetId);
        target.friends.push(id);
        target.friendRequestsSent = target.friendRequestsSent.filter(x => x !== id);
      } else {
        sender.friendRequestsSent.push(finalTargetId);
        target.friendRequestsReceived.push(id);
      }
    } else if (action === 'accept') {
      if (!sender.friendRequestsReceived.includes(finalTargetId)) {
        return res.status(400).json({ error: 'No friend request from this user' });
      }
      sender.friends.push(finalTargetId);
      sender.friendRequestsReceived = sender.friendRequestsReceived.filter(x => x !== finalTargetId);
      target.friends.push(id);
      target.friendRequestsSent = target.friendRequestsSent.filter(x => x !== id);
    } else if (action === 'decline') {
      sender.friendRequestsReceived = sender.friendRequestsReceived.filter(x => x !== finalTargetId);
      target.friendRequestsSent = target.friendRequestsSent.filter(x => x !== id);
    } else if (action === 'remove') {
      sender.friends = sender.friends.filter(x => x !== finalTargetId);
      target.friends = target.friends.filter(x => x !== id);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    await DB.updateProfile(id, {
      friends: sender.friends,
      friendRequestsSent: sender.friendRequestsSent,
      friendRequestsReceived: sender.friendRequestsReceived
    });
    await DB.updateProfile(finalTargetId, {
      friends: target.friends,
      friendRequestsSent: target.friendRequestsSent,
      friendRequestsReceived: target.friendRequestsReceived
    });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
