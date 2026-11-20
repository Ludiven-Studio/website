// The admin pages' sign-in: the site's Google account; the functions decide who may see what.
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { currentSession, onSessionChange, takeRedirectError } from '../../lib/meetupAuth';

export function useAdminSession(local: boolean): { session: Session | null; ready: boolean; error: string | null } {
	const [session, setSession] = useState<Session | null>(null);
	const [ready, setReady] = useState(local);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (local) return;
		setError(takeRedirectError());
		currentSession().then((s) => {
			setSession(s);
			setReady(true);
		});
		return onSessionChange(setSession);
	}, [local]);
	return { session, ready, error };
}
