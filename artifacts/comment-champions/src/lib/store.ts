import { useState, useEffect, useCallback } from 'react';

export type Platform = 'facebook' | 'instagram';

export type Participant = {
  id: string;
  name: string;
  profilePhotoUrl?: string;
  platform: Platform;
  commentCount: number;
  rank: number;
  recentCommentAt: string;
  winnerStatus?: 'pending' | 'winner' | 'runner-up';
};

export type GiveawayStatus = 'idle' | 'running' | 'paused' | 'completed';

export type GiveawayState = {
  id: string;
  title: string;
  source: Platform;
  postUrl: string;
  status: GiveawayStatus;
  participantCount: number;
  totalComments: number;
  lastSyncedAt: string;
  prizeCount: number;
  participants: Participant[];
};

const SEED_PARTICIPANTS: Participant[] = [
  { id: '1', name: 'هەڤاڵ ئەحمەد', platform: 'instagram', commentCount: 142, rank: 1, recentCommentAt: new Date().toISOString(), profilePhotoUrl: 'https://i.pravatar.cc/150?u=1' },
  { id: '2', name: 'سارا دارا', platform: 'facebook', commentCount: 128, rank: 2, recentCommentAt: new Date().toISOString(), profilePhotoUrl: 'https://i.pravatar.cc/150?u=2' },
  { id: '3', name: 'ئارام عەلی', platform: 'instagram', commentCount: 115, rank: 3, recentCommentAt: new Date().toISOString() },
  { id: '4', name: 'نەوزاد سابیر', platform: 'instagram', commentCount: 95, rank: 4, recentCommentAt: new Date().toISOString() },
  { id: '5', name: 'شنیار کامەران', platform: 'facebook', commentCount: 88, rank: 5, recentCommentAt: new Date().toISOString() },
  { id: '6', name: 'کۆسار نەجم', platform: 'instagram', commentCount: 76, rank: 6, recentCommentAt: new Date().toISOString() },
  { id: '7', name: 'دانا محەمەد', platform: 'facebook', commentCount: 65, rank: 7, recentCommentAt: new Date().toISOString() },
  { id: '8', name: 'ڕێبین سەردار', platform: 'instagram', commentCount: 54, rank: 8, recentCommentAt: new Date().toISOString() },
  { id: '9', name: 'سۆزیار عوسمان', platform: 'facebook', commentCount: 43, rank: 9, recentCommentAt: new Date().toISOString() },
  { id: '10', name: 'لانە ئازاد', platform: 'instagram', commentCount: 32, rank: 10, recentCommentAt: new Date().toISOString() },
];

export const defaultState: GiveawayState = {
  id: 'g1',
  title: 'خەڵاتی پایزەی گیادەرمانی',
  source: 'instagram',
  postUrl: 'https://instagram.com/p/paiz-giveaway',
  status: 'idle',
  participantCount: 10,
  totalComments: 838,
  lastSyncedAt: new Date().toISOString(),
  prizeCount: 3,
  participants: SEED_PARTICIPANTS,
};

const STORAGE_KEY = 'comment_champions_state';

export function useGiveawayStore() {
  const [state, setState] = useState<GiveawayState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return defaultState;
      }
    }
    return defaultState;
  });

  const updateState = useCallback((updates: Partial<GiveawayState> | ((prev: GiveawayState) => GiveawayState)) => {
    setState(prev => {
      const next = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      
      if (next.participants !== prev.participants) {
        const sorted = [...next.participants].sort((a, b) => b.commentCount - a.commentCount);
        next.participants = sorted.map((p, i) => ({ ...p, rank: i + 1 }));
        next.totalComments = next.participants.reduce((acc, p) => acc + p.commentCount, 0);
        next.participantCount = next.participants.length;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('storage'));
      return next;
    });
  }, []);

  useEffect(() => {
    const handleStorage = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setState(JSON.parse(saved));
        } catch (e) {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return { state, updateState };
}

export function simulateNewComments(state: GiveawayState): GiveawayState {
  const newParticipants = state.participants.map(p => {
    const added = Math.floor(Math.random() * 6);
    return {
      ...p,
      commentCount: p.commentCount + added,
      recentCommentAt: added > 0 ? new Date().toISOString() : p.recentCommentAt
    };
  });
  
  if (Math.random() > 0.7 && newParticipants.length < 25) {
    const firstNames = ["ئاسۆ", "بڕوا", "پەیام", "تارا", "جوانە", "چیا", "خەندە", "دەریا", "ڕێژین"];
    const lastNames = ["قادر", "کەریم", "مەحمود", "عومەر", "حەسەن", "ڕەسوڵ", "عەبدوڵڵا", "ساڵح"];
    newParticipants.push({
      id: Math.random().toString(36).substring(7),
      name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
      platform: Math.random() > 0.5 ? 'instagram' : 'facebook',
      commentCount: Math.floor(Math.random() * 10) + 1,
      rank: 0,
      recentCommentAt: new Date().toISOString()
    });
  }

  return {
    ...state,
    participants: newParticipants,
    lastSyncedAt: new Date().toISOString(),
  };
}