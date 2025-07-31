import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Part } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ProcessedFile } from '../types';
import { CloseIcon, ChatIcon, PaperclipIcon, ChevronRightIcon, CopyIcon } from './Icons';

// --- Types ---
interface Message {
    role: 'user' | 'model';
    text: string;
    image?: string; // base64 data URL for display
}

interface ChatSidebarProps {
    files: ProcessedFile[];
    isOpen: boolean;
    onToggle: () => void;
}

// --- LocalStorage Persistence for Chat ---
const saveChatToLocalStorage = (messages: Message[]) => {
    try {
        localStorage.setItem('chatHistory', JSON.stringify(messages));
    } catch (error) {
        console.error("Could not save chat history to localStorage", error);
    }
};

const loadChatFromLocalStorage = (): Message[] => {
    try {
        const savedState = localStorage.getItem('chatHistory');
        return savedState ? JSON.parse(savedState) : [];
    } catch (error) {
        console.error("Could not load chat history from localStorage", error);
        return [];
    }
};


// --- Helper Functions ---
const decoder = new TextDecoder('utf-8');
const decodeFileContent = (buffer: ArrayBuffer): string => {
    try { return decoder.decode(buffer); } 
    catch (e) { console.error("Failed to decode file content", e); return "[Error: Could not decode file content]"; }
};

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

// --- Code Block Component with Copy Button ---
const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
    const [isCopied, setIsCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const codeText = String(children).replace(/\n$/, '');

    const handleCopy = () => {
        navigator.clipboard.writeText(codeText).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    return !inline ? (
        <div className="relative bg-gray-800 rounded-md my-2 text-sm text-white">
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded-md text-gray-300 hover:text-white transition-colors"
                aria-label="Copy code"
            >
                {isCopied ? 'Copied!' : <CopyIcon className="w-4 h-4" />}
            </button>
            <SyntaxHighlighter style={atomDark} language={match?.[1]} PreTag="div" {...props}>
                {codeText}
            </SyntaxHighlighter>
        </div>
    ) : (
        <code className="bg-gray-800/70 text-teal-300 font-mono px-1.5 py-0.5 rounded-md" {...props}>
            {children}
        </code>
    );
};


// --- Chat Message Component ---
const ChatMessage: React.FC<{ message: Message; isTyping?: boolean; }> = ({ message, isTyping }) => {
    const isModel = message.role === 'model';
    
    return (
        <div className={`flex w-full ${isModel ? 'justify-start' : 'justify-end'}`}>
            <div className={`p-3 rounded-lg max-w-sm md:max-w-md text-sm ${isModel ? 'bg-gray-700' : 'bg-blue-600'}`}>
                {message.image && <img src={message.image} alt="User upload" className="rounded-lg mb-2 max-w-full h-auto" />}
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        h1: ({node, ...props}) => <h1 className="text-xl font-bold my-2" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-lg font-semibold my-2" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-base font-semibold my-1