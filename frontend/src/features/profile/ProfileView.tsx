import React, { useState, useEffect, useRef } from 'react';
import { safeParseJson } from '../../utils/api';
import { useGameStore } from '../../store/useGameStore';
import { AvatarIcon } from '../auth/AuthView';
import { ArrowLeft, Trophy, Calendar, Users, Target, Activity } from 'lucide-react';

interface MatchHistoryEntry {
    match_id: number;
    mode: string;
    target_score: number;
    result: 'won' | 'lost' | 'abandoned';
    winner: string | null;
    opponents: string;
    played_at: string | null;
}

interface Stats {
    matches_played: number;
    matches_won: number;
    rounds_played: number;
    rounds_won: number;
    total_points: number;
}

export const ProfileView = ({ onViewLobby }: { onViewLobby: () => void }) => {
    const { token, updateUserAvatar } = useGameStore();
    const [stats, setStats] = useState<Stats | null>(null);
    const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!token) return;
            try {
                const res = await fetch('/api/profile', {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
                });
                const data = await safeParseJson(res);
                if (res.ok) {
                    setStats(data.user.stats);
                    setHistory(data.user.history || []);
                    setUser(data.user);
                }
            } catch (err) {
                console.error('Failed to load profile:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [token]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('avatar_file', file);

        try {
            const res = await fetch('/api/profile/avatar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                },
                body: formData
            });
            const data = await safeParseJson(res);
            if (res.ok) {
                updateUserAvatar(data.avatar);
                setUser((prev: any) => prev ? { ...prev, avatar: data.avatar } : null);
            } else {
                alert(data.message || 'Failed to upload avatar.');
            }
        } catch (err) {
            console.error('Avatar upload error:', err);
            alert('An error occurred during avatar upload.');
        } finally {
            setUploading(false);
        }
    };

    const winRatio = stats && stats.matches_played > 0 
        ? Math.round((stats.matches_won / stats.matches_played) * 100) 
        : 0;

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            {/* Top Toolbar */}
            <div className="flex justify-start mb-6">
                <button
                    onClick={onViewLobby}
                    className="flex items-center space-x-2 text-sm text-gray-400 hover:text-white transition-colors bg-white/5 border border-white/5 px-3.5 py-2 rounded-lg active:scale-95"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Lobby</span>
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500 font-medium">Loading profile statistics...</div>
            ) : (
                <div className="space-y-8">
                    {/* User profile card */}
                    <div className="flex items-center space-x-5 p-6 rounded-2xl glass-panel relative overflow-hidden">
                        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-cyber-accent/15 blur-3xl" />
                        
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept="image/*" 
                            className="hidden" 
                        />

                        <div 
                            onClick={() => !uploading && fileInputRef.current?.click()}
                            className="p-3 bg-white/5 rounded-xl border border-white/10 relative cursor-pointer group hover:border-cyber-neon hover:scale-105 active:scale-95 transition-all duration-300"
                            title="Click to upload custom avatar"
                        >
                            {user && <AvatarIcon id={user.avatar} className="w-16 h-16 object-cover" />}
                            <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] font-black text-cyber-neon tracking-widest">{uploading ? 'LOADING' : 'UPLOAD'}</span>
                            </div>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white text-glow-accent m-0">{user?.username}</h2>
                            <p className="text-xs text-gray-400 mt-1">
                                {uploading ? 'Uploading custom avatar file...' : 'Click avatar badge to upload custom profile image'}
                            </p>
                        </div>
                    </div>

                    {/* Stats Dashboard cards Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl glass-panel text-left">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">Matches Played</span>
                                <Activity className="w-4 h-4 text-indigo-400" />
                            </div>
                            <strong className="text-2xl text-white font-mono block mt-2">{stats?.matches_played}</strong>
                            <span className="text-[9px] text-gray-500 block mt-1">Total games entered</span>
                        </div>

                        <div className="p-4 rounded-xl glass-panel text-left">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">Matches Won</span>
                                <Trophy className="w-4 h-4 text-amber-400" />
                            </div>
                            <strong className="text-2xl text-white font-mono block mt-2">{stats?.matches_won}</strong>
                            <span className="text-[9px] text-gray-500 block mt-1">Total match victories</span>
                        </div>

                        <div className="p-4 rounded-xl glass-panel text-left">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">Win Ratio</span>
                                <Target className="w-4 h-4 text-cyber-neon" />
                            </div>
                            <strong className="text-2xl text-cyber-neon font-mono block mt-2">{winRatio}%</strong>
                            <span className="text-[9px] text-gray-500 block mt-1">Percentage of wins</span>
                        </div>

                        <div className="p-4 rounded-xl glass-panel text-left">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">Total Points</span>
                                <Trophy className="w-4 h-4 text-emerald-400" />
                            </div>
                            <strong className="text-2xl text-white font-mono block mt-2">{stats?.total_points}</strong>
                            <span className="text-[9px] text-gray-500 block mt-1">Sum of points earned</span>
                        </div>
                    </div>

                    {/* Match History Table */}
                    <div className="p-6 rounded-2xl glass-panel">
                        <h3 className="text-lg font-bold text-white mb-6 text-glow-accent">Match History</h3>
                        
                        {history.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">No matches logged yet. Play games to log statistics!</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-white/5 text-gray-400">
                                            <th className="py-3 font-semibold uppercase">Date</th>
                                            <th className="py-3 font-semibold uppercase">Mode</th>
                                            <th className="py-3 font-semibold uppercase">Opponents</th>
                                            <th className="py-3 font-semibold uppercase text-center">Result</th>
                                            <th className="py-3 font-semibold uppercase text-right">Target Score</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {history.map((entry, idx) => (
                                            <tr key={idx} className="hover:bg-white/1 text-gray-300">
                                                <td className="py-3.5 flex items-center space-x-1.5">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                                                    <span>{entry.played_at ? new Date(entry.played_at).toLocaleDateString() : 'N/A'}</span>
                                                </td>
                                                <td className="py-3.5">
                                                    <span className="px-2 py-0.5 bg-white/5 border border-white/5 rounded text-[10px] uppercase font-bold">
                                                        {entry.mode}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 max-w-xs truncate">
                                                    <span className="flex items-center space-x-1">
                                                        <Users className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                                        <span className="truncate">{entry.opponents || 'None'}</span>
                                                    </span>
                                                </td>
                                                <td className="py-3.5 text-center">
                                                    <span className={`px-2.5 py-0.5 rounded font-bold uppercase ${entry.result === 'won' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : entry.result === 'lost' ? 'bg-rose-500/10 border border-rose-500/20 text-cyber-danger' : 'bg-gray-500/10 border border-gray-500/20 text-gray-400'}`}>
                                                        {entry.result}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 text-right font-mono font-bold text-gray-400">
                                                    {entry.target_score} pts
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
