export const getFileContent = async (): Promise<string> => {
    const apiBaseUrl = ``;
    const response = await fetch(`${apiBaseUrl}/api/fixer/file-content`);
    if (!response.ok) {
        throw new Error('Failed to fetch backend file content.');
    }
    return response.text();
};

export const applyFix = (newCode: string): Promise<Response> => {
    const apiBaseUrl = ``;
    return fetch(`${apiBaseUrl}/api/fixer/apply-fix`, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain',
        },
        body: newCode,
    });
};