import React, { useState, useEffect, useRef } from 'react';
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
        if (messages.length === 0) {
            localStorage.removeItem('chatHistory');
            return;
        }
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
            <div className="flex items-center justify-between px-4 py-1 bg-gray-700/50 rounded-t-md">
                 <span className="text-xs text-gray-400">{match?.[1] || 'code'}</span>
                <button
                    onClick={handleCopy}
                    className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded-md text-gray-300 hover:text-white transition-colors text-xs flex items-center gap-1"
                    aria-label="Copy code"
                >
                    <CopyIcon className="w-4 h-4" />
                    {isCopied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <SyntaxHighlighter style={atomDark} language={match?.[1]} PreTag="div" customStyle={{margin: 0, padding: '1rem', backgroundColor: 'transparent' }} {...props}>
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
            <div className={`p-3 rounded-xl max-w-sm md:max-w-md text-sm ${isModel ? 'bg-gray-700 text-gray-200' : 'bg-blue-600 text-white'}`}>
                {message.image && <img src={message.image} alt="User upload" className="rounded-lg mb-2 max-w-full h-auto" />}
                {isTyping ? (
                     <div className="flex items-center space-x-1 p-2">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                    </div>
                ) : (
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: ({node, ...props}) => <h1 className="text-xl font-bold my-2" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-lg font-semibold my-2" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-base font-semibold my-1" {...props} />,
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 pl-2" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 pl-2" {...props} />,
                            a: ({node, ...props}) => <a className="text-teal-300 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                            code: CodeBlock,
                        }}
                    >
                        {message.text}
                    </ReactMarkdown>
                )}
            </div>
        </div>
    );
};

// --- Chat Sidebar Component ---
const ChatSidebar: React.FC<ChatSidebarProps> = ({ files, isOpen, onToggle }) => {
    const [messages, setMessages] = useState<Message[]>(loadChatFromLocalStorage);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [attachedImage, setAttachedImage] = useState<{file: File, url: string} | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        saveChatToLocalStorage(messages);
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);
    
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [input]);

    const handleSendMessage = async () => {
        if ((!input.trim() && !attachedImage) || isLoading) return;

        const userMessageText = input.trim();
        const userMessage: Message = { role: 'user', text: userMessageText, image: attachedImage?.url };
        
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        const tempAttachedImage = attachedImage;
        setAttachedImage(null);
        setIsLoading(true);

        try {
            const contents: any[] = [];
            
            if (tempAttachedImage) {
                const base64Image = await fileToBase64(tempAttachedImage.file);
                contents.push({ inlineData: { mimeType: tempAttachedImage.file.type, data: base64Image } });
            }

            let promptText = userMessageText;
            if (files.length > 0) {
                const fileContents = files.map(f => `--- START OF FILE: ${f.originalPath} ---\n${decodeFileContent(f.content)}\n--- END OF FILE: ${f.originalPath} ---`).join('\n\n');
                promptText = `Based on the following file contents, please answer the user's question.\n\nFILE CONTEXT:\n${fileContents}\n\nUSER QUESTION:\n${userMessageText}`;
            }
            contents.push({ text: promptText });
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents }),
            });

            if (!response.ok || !response.body) {
                const errorBody = await response.json().catch(() => ({ error: 'Failed to parse error response.' }));
                throw new Error(errorBody.error || response.statusText || 'Failed to get a response from the server.');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let isFirstChunk = true;
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });

                if (isFirstChunk) {
                    setMessages(prev => [...prev, { role: 'model', text: chunk }]);
                    isFirstChunk = false;
                } else {
                    setMessages(prev => {
                        const lastMessageIndex = prev.length - 1;
                        if (prev[lastMessageIndex]?.role === 'model') {
                            const updatedMessages = [...prev];
                            updatedMessages[lastMessageIndex] = {
                                ...updatedMessages[lastMessageIndex],
                                text: updatedMessages[lastMessageIndex].text + chunk,
                            };
                            return updatedMessages;
                        }
                        return prev;
                    });
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessageText = error instanceof Error ? error.message : String(error);
            const errorMessage: Message = { role: 'model', text: `Sorry, an error occurred: ${errorMessageText}` };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const url = URL.createObjectURL(file);
            setAttachedImage({ file, url });
            e.target.value = ''; // Reset input to allow re-attaching the same file
        }
    };

    return (
        <>
            <button
                onClick={onToggle}
                className="fixed top-4 left-4 z-50 p-3 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-all duration-300 ease-in-out shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
                aria-label={isOpen ? "Close AI Analyst" : "Open AI Analyst"}
            >
                {isOpen ? <CloseIcon className="w-6 h-6" /> : <ChatIcon className="w-6 h-6" />}
            </button>

            <aside className={`fixed top-0 left-0 h-full w-full max-w-[400px] bg-gray-800/95 backdrop-blur-sm border-r border-gray-700 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out z-40 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0 pt-20">
                    <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">
                        AI Analyst
                    </h2>
                </header>

                <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4">
                    {messages.map((msg, index) => <ChatMessage key={index} message={msg} />)}
                    {isLoading && <ChatMessage message={{ role: 'model', text: '' }} isTyping={true} />}
                </div>

                <div className="p-4 border-t border-gray-700 bg-gray-800/50">
                    {attachedImage && (
                        <div className="relative mb-2 p-2 bg-gray-700 rounded-lg max-w-full inline-block">
                            <img src={attachedImage.url} alt="preview" className="max-h-32 rounded-lg object-cover" />
                            <button onClick={() => setAttachedImage(null)} className="absolute top-0 right-0 -mt-2 -mr-2 bg-red-500 rounded-full p-0.5 text-white shadow-md hover:bg-red-400">
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    <div className="flex items-end gap-2 bg-gray-700 rounded-lg p-2">
                        <button onClick={() => imageInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white flex-shrink-0 disabled:text-gray-600 disabled:cursor-not-allowed">
                            <PaperclipIcon />
                        </button>
                        <input type="file" ref={imageInputRef} onChange={handleImageAttach} accept="image/*" className="hidden" />
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                            placeholder={"Ask about your files..."}
                            className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none resize-none max-h-32"
                        />
                        <button onClick={handleSendMessage} disabled={isLoading || (!input.trim() && !attachedImage)} className="p-2 bg-blue-600 rounded-full text-white disabled:bg-gray-600 disabled:cursor-not-allowed flex-shrink-0 transition-colors">
                            <ChevronRightIcon className="w-5 h-5 transform -rotate-45" />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default ChatSidebar;