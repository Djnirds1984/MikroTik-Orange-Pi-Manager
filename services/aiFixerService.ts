const API_BASE_URL = `http://${window.location.hostname}:3001`;

export const getFileContent = async (): Promise<string> => {
    const response = await fetch(`${API_BASE_URL}/api/fixer/file-content`);
    if (!response.ok) {
        throw new Error('Failed to fetch backend file content.');
    }
    return response.text();
};

// FIX: Corrected the function's return type from EventSource to Promise<Response> to match the value returned by fetch, resolving a TypeScript error.
// The previous implementation was incorrect as fetch returns a Promise, not an EventSource.
// Also removed extensive commented-out and duplicate code from the function body.
export const applyFix = (newCode: string): Promise<Response> => {
    return fetch(`${API_BASE_URL}/api/fixer/apply-fix`, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain',
        },
        body: newCode,
    });
};
