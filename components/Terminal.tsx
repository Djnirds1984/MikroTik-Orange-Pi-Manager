
import React, { useEffect, useRef } from 'react';
import type { RouterConfigWithId } from '../types.ts';
import { Terminal as XtermTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export const Terminal: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XtermTerminal | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (!terminalRef.current || !selectedRouter) return;

        // Initialize xterm.js
        const xterm = new XtermTerminal({
            cursorBlink: true,
            theme: {
                background: '#1e293b', // slate-800
                foreground: '#cbd5e1', // slate-300
            }
        });
        const fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);
        xterm.open(terminalRef.current);
        fitAddon.fit();
        xtermRef.current = xterm;
        
        // Setup WebSocket connection
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProto}//${window.location.hostname}:3002/ws/ssh`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            xterm.writeln('*** WebSocket Connected ***');
            // Send auth details
            const term_cols = xterm.cols;
            const rows = xterm.rows;
            const authPayload = {
                type: 'auth',
                data: { ...selectedRouter, term_cols, rows }
            };
            ws.send(JSON.stringify(authPayload));
        };

        ws.onmessage = (event) => {
            xterm.write(event.data);
        };

        ws.onerror = (event) => {
            xterm.writeln('\r\n*** WebSocket Error ***');
            console.error('WebSocket Error:', event);
        };

        ws.onclose = () => {
            xterm.writeln('\r\n*** WebSocket Disconnected ***');
        };

        // Handle user input
        const onDataDisposable = xterm.onData(data => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'data', data }));
            }
        });
        
        // Handle resize
        const onResizeDisposable = xterm.onResize(({ cols, rows }) => {
             if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
        });
        
        // Fit terminal on window resize
        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            onDataDisposable.dispose();
            onResizeDisposable.dispose();
            ws.close();
            xterm.dispose();
            window.removeEventListener('resize', handleResize);
        };

    }, [selectedRouter]);
    
    if (!selectedRouter) {
        return (
            <div className="flex items-center justify-center h-full text-slate-500">
                <p>Please select a router to open its terminal.</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-800 rounded-lg h-[75vh] min-h-[500px] w-full p-2 border border-slate-700">
            <div ref={terminalRef} className="h-full w-full" />
        </div>
    );
};
