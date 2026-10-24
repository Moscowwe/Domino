import React, { useState } from 'react';
import { safeParseJson } from '../../utils/api';
import { useGameStore } from '../../store/useGameStore';
import { supabase } from '../../lib/supabase';
import { Shield, Zap, Sparkles, Crown, Swords, Heart, User, Key, Mail, ArrowRight, Hexagon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AVATAR_OPTIONS = [
    { id: 'avatar_crown',    icon: Crown,    label: 'Crown',    color: 'text-yellow-400',  ring: 'rgba(251,191,36,0.5)',  bg: 'rgba(251,191,36,0.08)' },
    { id: 'avatar_zap',      icon: Zap,      label: 'Zap',      color: 'text-cyan-400',    ring: 'rgba(0,229,255,0.5)',   bg: 'rgba(0,229,255,0.08)'  },
    { id: 'avatar_shield',   icon: Shield,   label: 'Shield',   color: 'text-blue-400',    ring: 'rgba(96,165,250,0.5)', bg: 'rgba(96,165,250,0.08)' },
    { id: 'avatar_sparkles', icon: Sparkles, label: 'Star',     color: 'text-purple-400',  ring: 'rgba(167,139,250,0.5)',bg: 'rgba(167,139,250,0.08)'},
    { id: 'avatar_swords',   icon: Swords,   label: 'Swords',   color: 'text-rose-400',    ring: 'rgba(251,113,133,0.5)',bg: 'rgba(251,113,133,0.08)'},
    { id: 'avatar_heart',    icon: Heart,    label: 'Heart',    color: 'text-emerald-400', ring: 'rgba(52,211,153,0.5)', bg: 'rgba(52,211,153,0.08)' },
];

export const AvatarIcon = ({ id, className = 'w-6 h-6' }: { id: string; className?: string }) => {
    if (id && (id.startsWith('storage/') || id.includes('/') || id.startsWith('data:'))) {
        const src = id.startsWith('storage/') ? '/' + id : id;
        return <img src={src} alt="Avatar" className={`${className} rounded-xl object-cover border border-white/20 shadow-inner`} />;
    }
    const opt = AVATAR_OPTIONS.find(o => o.id === id) || AVATAR_OPTIONS[0];
    const Icon = opt.icon;
    return <Icon className={`${className} ${opt.color}`} />;
};

export const AuthView = () => {
    const setAuth = useGameStore(state => state.setAuth);
    const [authMode, setAuthMode] = useState<'login' | 'register' | 'guest'>('login');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState('avatar_crown');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        let endpoint = '';
        let body = {};
        
        if (authMode === 'login') {
            endpoint = '/api/login';
            body = { email, password };
        } else if (authMode === 'register') {
            endpoint = '/api/register';
            body = { username, email, password, password_confirmation: passwordConfirm, avatar: selectedAvatar };
        } else {
            endpoint = '/api/login/guest';
            body = { username, avatar: selectedAvatar };
        }

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await safeParseJson(res);
            if (res.ok && data?.user) {
                setAuth(data.user, data.token || 'auth_token');
                return;
            }
            throw new Error(data?.message || 'Server unavailable, trying Supabase...');
        } catch (_primaryErr: any) {
            // Direct Supabase Auth / Local Fallback
            try {
                if (authMode === 'register') {
                    const { data, error: sbError } = await supabase.auth.signUp({
                        email,
                        password,
                        options: { data: { username: username || email.split('@')[0], avatar: selectedAvatar } }
                    });
                    if (sbError) throw sbError;
                    const u = {
                        id: Math.floor(Math.random() * 899999) + 100000,
                        username: username || email.split('@')[0],
                        avatar: selectedAvatar,
                        email
                    };
                    setAuth(u, data.session?.access_token || 'supabase_token');
                } else if (authMode === 'login') {
                    const { data, error: sbError } = await supabase.auth.signInWithPassword({
                        email,
                        password
                    });
                    if (sbError) throw sbError;
                    const u = {
                        id: Math.floor(Math.random() * 899999) + 100000,
                        username: data.user.user_metadata?.username || email.split('@')[0],
                        avatar: data.user.user_metadata?.avatar || 'avatar_crown',
                        email
                    };
                    setAuth(u, data.session?.access_token || 'supabase_token');
                } else {
                    // Guest login
                    const guestId = Math.floor(Math.random() * 899999) + 100000;
                    const guestUser = {
                        id: guestId,
                        username: username.trim() || `Player_${guestId.toString().slice(-4)}`,
                        avatar: selectedAvatar,
                        email: 'guest@domino.io'
                    };
                    setAuth(guestUser, 'guest_' + guestId);
                }
            } catch (sbErr: any) {
                setError(sbErr.message || 'Authentication failed.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-112px)] flex items-center justify-center px-4 py-12 relative">

            {/* Ambient glow behind card */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] rounded-full bg-cyan-500/6 blur-[120px] pointer-events-none" />

            <motion.div
                className="w-full max-w-[440px] relative"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
            >
                {/* Card */}
                <div className="glass-panel rounded-[28px] overflow-hidden">

                    {/* Card top accent line */}
                    <div className="h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

                    <div className="p-8 md:p-10">
                        {/* Logo */}
                        <div className="flex flex-col items-center mb-8 gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center shadow-[0_0_24px_rgba(0,229,255,0.15)]">
                                <Hexagon className="w-7 h-7 text-cyan-400" strokeWidth={1.5} />
                            </div>
                            <div className="text-center">
                                <h1 className="text-2xl font-black tracking-[0.15em] text-white m-0">
                                    DOMINO<span className="text-cyan-400">.</span>IO
                                </h1>
                                <p className="text-xs text-slate-500 mt-1 font-medium">Realtime Multiplayer Platform</p>
                            </div>
                        </div>

                        {/* Tab switcher */}
                        <div className="flex gap-1 p-1 rounded-xl bg-black/30 border border-white/6 mb-7">
                            {(['login', 'register', 'guest'] as const).map((mode) => {
                                const labels = { login: 'Sign In', register: 'Sign Up', guest: 'Play as Guest' };
                                const active = mode === authMode;
                                return (
                                    <button
                                        key={mode}
                                        onClick={() => { setAuthMode(mode); setError(''); }}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                                            active
                                                ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-300'
                                                : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {labels[mode]}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Error */}
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-semibold"
                                >
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Username (register and guest) */}
                            <AnimatePresence>
                                {(authMode === 'register' || authMode === 'guest') && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                    >
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                            {authMode === 'guest' ? 'Guest Name' : 'Username'}
                                        </label>
                                        <div className="relative">
                                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <input
                                                type="text" required value={username}
                                                onChange={e => setUsername(e.target.value)}
                                                placeholder={authMode === 'guest' ? 'Enter a nickname' : 'Choose a username'}
                                                className="input-dark pl-10"
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Email & Password (login and register) */}
                            <AnimatePresence>
                                {authMode !== 'guest' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-4 overflow-hidden"
                                    >
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
                                            <div className="relative">
                                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                                <input
                                                    type="email" required value={email}
                                                    onChange={e => setEmail(e.target.value)}
                                                    placeholder="name@example.com"
                                                    className="input-dark pl-10"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
                                            <div className="relative">
                                                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                                <input
                                                    type="password" required value={password}
                                                    onChange={e => setPassword(e.target.value)}
                                                    placeholder="••••••••"
                                                    className="input-dark pl-10"
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Confirm password (register only) + Avatar (register and guest) */}
                            <AnimatePresence>
                                {authMode === 'register' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-4 overflow-hidden"
                                    >
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Confirm Password</label>
                                            <div className="relative">
                                                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                                <input
                                                    type="password" required value={passwordConfirm}
                                                    onChange={e => setPasswordConfirm(e.target.value)}
                                                    placeholder="••••••••"
                                                    className="input-dark pl-10"
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                                        
                            <AnimatePresence>
                                {(authMode === 'register' || authMode === 'guest') && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden mt-4"
                                    >
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Choose Avatar</label>
                                            <div className="grid grid-cols-6 gap-2">
                                                {AVATAR_OPTIONS.map(opt => {
                                                    const Icon = opt.icon;
                                                    const isSelected = selectedAvatar === opt.id;
                                                    return (
                                                        <motion.button
                                                            key={opt.id}
                                                            type="button"
                                                            onClick={() => setSelectedAvatar(opt.id)}
                                                            whileHover={{ scale: 1.08 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            className="relative flex items-center justify-center aspect-square rounded-xl border transition-all duration-200"
                                                            style={{
                                                                background: isSelected ? opt.bg : 'rgba(255,255,255,0.04)',
                                                                borderColor: isSelected ? opt.ring : 'rgba(255,255,255,0.08)',
                                                                boxShadow: isSelected ? `0 0 16px ${opt.ring}` : 'none'
                                                            }}
                                                        >
                                                            <Icon className={`w-5 h-5 ${opt.color} ${!isSelected ? 'opacity-50' : ''}`} />
                                                        </motion.button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Submit */}
                            <motion.button
                                type="submit"
                                disabled={loading}
                                className="btn-primary w-full mt-2 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <motion.div
                                            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                                        />
                                        Processing...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        {authMode === 'login' ? 'Sign In' : authMode === 'register' ? 'Create Account' : 'Start Playing'}
                                        <ArrowRight className="w-4 h-4" />
                                    </span>
                                )}
                            </motion.button>
                        </form>
                    </div>
                </div>

                {/* Bottom hint */}
                <p className="text-center text-xs text-slate-600 mt-4 font-medium">
                    Secure · Realtime · Authoritative Engine
                </p>
            </motion.div>
        </div>
    );
};
