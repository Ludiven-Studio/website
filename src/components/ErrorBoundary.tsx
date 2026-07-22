import { Component, type ErrorInfo, type ReactNode } from 'react';

// Stops a render error in one island (e.g. a bad leaderboard row) from blanking
// the whole game page. Shows `fallback` instead of the crashed subtree.

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
	state: State = { hasError: false };

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error('ErrorBoundary caught an error', error, info);
	}

	render(): ReactNode {
		if (this.state.hasError) return this.props.fallback ?? null;
		return this.props.children;
	}
}
