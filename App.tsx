

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { ProcessedFile as ProcessedFileType, SerializableFile } from './types';
import { UploadIcon, DownloadIcon, ClearIcon, FileIcon, ArrowRightIcon, BackArrowIcon, TextFileIcon } from './components/Icons';
import ChatSidebar from './components/ChatSidebar';

// Since JSZip is loaded from a CDN, we need to declare it to TypeScript.
declare var JSZip: any;

type View = 'upload' | 'files';
type FileWithRelativePath = { file: File; path: string };

// --- LocalStorage Persistence Helpers ---
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

const saveStateToLocalStorage = (processedFiles: ProcessedFileType[]) => {
    try {
        if (processedFiles.length === 0) {
            localStorage.removeItem('fileConverterState');
            return;
        }
        const serializableFiles: SerializableFile[] = processedFiles.map(file => ({
            ...file,
            content: arrayBufferToBase64(file.content),
        }));
        localStorage.setItem('fileConverterState', JSON.stringify(serializableFiles));
    } catch (error) {
        console.error("Could not save state to localStorage", error);
    }
};

const loadStateFromLocalStorage = (): ProcessedFileType[] => {
    try {
        const savedState = localStorage.getItem('fileConverterState');
        if (savedState) {
            const serializableFiles: SerializableFile[] = JSON.parse(savedState);
            return serializableFiles.map(file => ({
                ...file,
                content: base64ToArrayBuffer(file.content),
            }));
        }
    } catch (error) {
        console.error("Could not load state from localStorage", error);
    }
    return [];
};


// --- Helper functions for directory traversal ---
interface CustomFileSystemEntry extends DataTransferItem {
    webkitGetAsEntry(): any;
}
interface CustomFileSystemDirectoryReader {
    readEntries(callback: (entries: any[]) => void, errorCallback?: (error: DOMException) => void): void;
}

function readAllDirectoryEntries(directoryReader: CustomFileSystemDirectoryReader): Promise<any[]> {
    return new Promise((resolve, reject) => {
        let allEntries: any[] = [];
        function readEntries() {
            directoryReader.readEntries(entries => {
                if (entries.length === 0) {
                    resolve(allEntries);
                } else {
                    allEntries = allEntries.concat(entries);
                    readEntries();
                }
            }, reject);
        }
        readEntries();
    });
}

async function getFilesFromEntry(entry: any): Promise<FileWithRelativePath[]> {
    if (!entry) return [];
    if (entry.isFile) {
        return new Promise<FileWithRelativePath[]>((resolve, reject) => {
            entry.file((file: File) => {
                const path = entry.fullPath.startsWith('/') ? entry.fullPath.substring(1) : entry.fullPath;
                resolve([{ file, path }]);
            }, reject);
        });
    }
    if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await readAllDirectoryEntries(reader);
        const nestedFiles = await Promise.all(entries.map(getFilesFromEntry));
        return nestedFiles.flat();
    }
    return [];
}

async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<FileWithRelativePath[]> {
    const items = Array.from(dataTransfer.items) as CustomFileSystemEntry[];
    if (items && items.length > 0 && items[0].webkitGetAsEntry) {
        const entries = items.map(item => item.webkitGetAsEntry()).filter(Boolean);
        const filesPromises = entries.map(getFilesFromEntry);
        const filesArrays = await Promise.all(filesPromises);
        const allFiles = filesArrays.flat();
        return allFiles.filter(f => !f.path.split('/').pop()?.startsWith('.'));
    }
    return Array.from(dataTransfer.files)
        .filter(file => !file.name.startsWith('.') && file.size > 0)
        .map(file => ({ file, path: file.name }));
}

const ConversionOptions = ['ts', 'tsx', 'js', 'jsx', 'json', 'txt', 'html', 'css', 'md'];

// --- Helper Components ---
const Header = () => (
    <header className="text-center p-6">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300">File Converter & AI Analyst</h1>
        <p className="text-gray-400 mt-2 max-w-2xl mx-auto">
            Convert files, analyze with AI. Press <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">R</kbd> to download.
        </p>
    </header>
);

interface UploadScreenProps {
  targetType: string;
  onTargetTypeChange: (newType: string) => void;
  preserveFolders: boolean;
  onPreserveFoldersChange: (value: boolean) => void;
  onFilesDrop: (dataTransfer: DataTransfer) => void;
  onUploadClick: () => void;
  isDragging: boolean;
}

const UploadScreen: React.FC<UploadScreenProps> = ({ targetType, onTargetTypeChange, preserveFolders, onPreserveFoldersChange, onFilesDrop, onUploadClick, isDragging }) => (
    <>
        <div className="mb-6 flex items-center justify-center gap-x-6 gap-y-4 flex-wrap">
            <div className="flex items-center gap-3">
                <label htmlFor="conversion-type" className="text-lg text-gray-300 font-medium">Convert all to:</label>
                <select id="conversion-type" value={targetType} onChange={(e) => onTargetTypeChange(e.target.value)} className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-mono shadow-md">
                    {ConversionOptions.map(opt => <option key={opt} value={opt}>.{opt}</option>)}
                </select>
            </div>
            <div className="flex items-center">
                <input id="preserve-folders" type="checkbox" checked={preserveFolders} onChange={e => onPreserveFoldersChange(e.target.checked)} className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-600 ring-offset-gray-800 focus:ring-2" />
                <label htmlFor="preserve-folders" className="ml-2 text-lg text-gray-300 font-medium">Preserve folder structure in zip</label>
            </div>
        </div>
        <div 
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onFilesDrop(e.dataTransfer); }}
            onClick={onUploadClick}
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ease-in-out ${isDragging ? 'border-blue-400 bg-gray-800 scale-105' : 'border-gray-600 hover:border-blue-500 hover:bg-gray-800/50'}`}
        >
            <UploadIcon className="w-16 h-16 text-gray-500 mb-4" />
            <p className="text-lg font-semibold text-gray-300">Drag & drop files or folders here</p>
            <p className="text-gray-500">or click to select</p>
        </div>
    </>
);

const FileList = ({ files }: { files: ProcessedFileType[] }) => {
    const getFileColor = (type: string) => {
        if (type === 'tsx' || type === 'jsx') return 'text-blue-400';
        if (type === 'ts' || type === 'js') return 'text-teal-300';
        if (type === 'json') return 'text-yellow-400';
        if (type === 'html') return 'text-orange-400';
        if (type === 'css') return 'text-indigo-400';
        return 'text-gray-400';
    }
    return (
        <div className="w-full bg-gray-800/50 rounded-lg p-4 space-y-3 max-h-[50vh] overflow-y-auto">
            {files.map(file => (
                <div key={file.id} className="flex items-center justify-between bg-gray-800 p-3 rounded-md shadow-md">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                        <FileIcon className={`w-8 h-8 flex-shrink-0 ${getFileColor(file.originalType)}`} />
                        <span className="font-mono text-sm text-gray-300 truncate" title={file.originalPath}>{file.originalPath}</span>
                    </div>
                    <div className="flex items-center gap-4 min-w-0 flex-1 justify-end">
                        <ArrowRightIcon className="w-6 h-6 text-gray-500 flex-shrink-0" />
                        <span className={`font-mono text-sm font-bold ${getFileColor(file.newType)} truncate`} title={file.newPath}>{file.newPath}</span>
                    </div>
                </div>
            ))}
        </div>
    );
};

const ActionButton: React.FC<React.PropsWithChildren<{ onClick: () => void; disabled?: boolean; color: string; }>> = ({ onClick, disabled, color, children }) => {
    const colorClasses = {
        blue: 'border-blue-500 text-blue-400 hover:bg-blue-500',
        purple: 'border-purple-500 text-purple-400 hover:bg-purple-500',
        green: 'border-green-500 text-green-400 hover:bg-green-500',
        red: 'border-red-500 text-red-400 hover:bg-red-500',
        gray: 'border-gray-500 text-gray-400 hover:bg-gray-500',
    };
    const selectedColor = colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;
    return (
        <button onClick={onClick} disabled={disabled} className={`flex items-center justify-center px-6 py-3 bg-transparent border ${selectedColor} font-semibold rounded-lg shadow-md hover:text-white disabled:border-gray-600 disabled:text-gray-500 disabled:bg-transparent disabled:cursor-not-allowed transition-all duration-300 ease-in-out transform hover:scale-105`}>
            {children}
        </button>
    );
};

const Loader = () => (
    <div className="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-blue-400"></div>
        <p className="text-white text-lg mt-4">Processing files...</p>
    </div>
);

// --- Main App Component ---
function App() {
    const [processedFiles, setProcessedFiles] = useState<ProcessedFileType[]>(loadStateFromLocalStorage);
    const [view, setView] = useState<View>(() => loadStateFromLocalStorage().length > 0 ? 'files' : 'upload');
    const [targetConversionType, setTargetConversionType] = useState<string>(() => localStorage.getItem('fileConverterTargetType') || 'ts');
    const [preserveFolders, setPreserveFolders] = useState<boolean>(() => localStorage.getItem('fileConverterPreserveFolders') !== 'false');
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        saveStateToLocalStorage(processedFiles);
        if (processedFiles.length === 0) {
            setView('upload');
        } else {
            setView('files');
        }
    }, [processedFiles]);

    useEffect(() => { localStorage.setItem('fileConverterTargetType', targetConversionType); }, [targetConversionType]);
    useEffect(() => { localStorage.setItem('fileConverterPreserveFolders', String(preserveFolders)); }, [preserveFolders]);

    const handleFileProcessing = useCallback(async (items: FileWithRelativePath[]) => {
        if (items.length === 0) { setIsLoading(false); return; }
        setIsLoading(true);
        const filePromises = items.map(item => new Promise<ProcessedFileType>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const originalPath = item.path;
                const getFileType = (name: string) => name.split('.').pop() || 'file';
                const pathParts = originalPath.split('/');
                const nameAndExt = pathParts.pop()!;
                const nameParts = nameAndExt.split('.');
                if (nameParts.length > 1) { nameParts.pop(); }
                const newName = `${nameParts.join('.')}.${targetConversionType}`;
                const newPath = [...pathParts, newName].filter(Boolean).join('/');
                resolve({ id: `${originalPath}-${item.file.lastModified}-${item.file.size}`, originalPath, newPath, content: reader.result as ArrayBuffer, originalType: getFileType(originalPath), newType: targetConversionType });
            };
            reader.onerror = (error) => reject({ error, file: item.file });
            reader.readAsArrayBuffer(item.file);
        }));
        try {
            const newFiles = await Promise.all(filePromises);
            setProcessedFiles(newFiles);
            setView('files');
        } catch (error: any) {
            console.error(`Error processing file: ${error.file?.name}`, error.error);
            alert(`An error occurred while reading file: ${error.file?.name}.`);
        } finally { setIsLoading(false); }
    }, [targetConversionType]);
    
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            const filesWithPaths = Array.from(e.target.files)
                .filter(file => !((file as any).webkitRelativePath === "" && file.name.startsWith('.')))
                .map(file => ({ file: file, path: (file as any).webkitRelativePath || file.name }));
            handleFileProcessing(filesWithPaths);
            if (e.target) e.target.value = '';
        }
    }, [handleFileProcessing]);
    
    const handleTriggerUpload = () => fileInputRef.current?.click();

    const handleDroppedItems = useCallback(async (dataTransfer: DataTransfer) => {
        setIsDragging(false); setIsLoading(true);
        try {
            const items = await extractFilesFromDataTransfer(dataTransfer);
            await handleFileProcessing(items);
        } catch(err) {
            console.error("Failed to extract files from drop event.", err);
            alert("Could not read dropped items.");
            setIsLoading(false);
        }
    }, [handleFileProcessing]);

    const handleDownloadZip = useCallback(() => {
        if (processedFiles.length === 0) return;
        const zip = new JSZip();
        processedFiles.forEach(file => {
            const path = preserveFolders ? file.newPath : (file.newPath.split('/').pop() || file.newPath);
            zip.file(path, file.content);
        });
        zip.generateAsync({ type: 'blob' }).then((content: Blob) => {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'converted-files.zip';
            a.click();
            URL.revokeObjectURL(url);
        }).catch((err: Error) => alert("Error creating zip file."));
    }, [processedFiles, preserveFolders]);
    
    const handleDownloadAsTxt = useCallback(() => {
        if (processedFiles.length === 0) return;
        let combinedContent = `Generated by File Converter & AI Analyst\n\n`;
        const decoder = new TextDecoder('utf-8');
        processedFiles.forEach(file => {
            combinedContent += `--- START OF FILE: ${file.originalPath} ---\n\n`;
            combinedContent += decoder.decode(file.content);
            combinedContent += `\n\n--- END OF FILE: ${file.originalPath} ---\n\n`;
        });
        const blob = new Blob([combinedContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'combined-files.txt';
        a.click();
        URL.revokeObjectURL(url);
    }, [processedFiles]);

    const handleSingleFileDownload = useCallback((file: ProcessedFileType) => {
        const blob = new Blob([file.content], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = file.newPath.split('/').pop() || 'downloaded-file';
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    const handleClear = () => setProcessedFiles([]);
    const handleGoBack = () => setView('upload');

    const dragCounter = useRef(0);
    const handleDragEnter = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (e.dataTransfer?.items?.length) setIsDragging(true); }, []);
    const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }, []);
    const handleDrop = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setIsDragging(false); if (e.dataTransfer) { handleDroppedItems(e.dataTransfer); } }, [handleDroppedItems]);
    
    useEffect(() => {
        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleDrop);
        window.addEventListener('dragover', (e) => e.preventDefault());
        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleDrop);
            window.removeEventListener('dragover', (e) => e.preventDefault());
        };
    }, [handleDragEnter, handleDragLeave, handleDrop]);

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName.toLowerCase().match(/input|textarea|select/)) return;
            if ((e.key === 'r' || e.key === 'R') && processedFiles.length > 0) {
                e.preventDefault();
                if (processedFiles.length === 1) handleSingleFileDownload(processedFiles[0]);
                else handleDownloadZip();
            }
        };
        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [processedFiles, handleDownloadZip, handleSingleFileDownload]);

    return (
        <div className="h-screen w-screen flex bg-gray-900 text-gray-100 font-sans relative overflow-hidden">
            {isLoading && <Loader />}
            <ChatSidebar 
                files={processedFiles} 
                isOpen={isSidebarOpen} 
                onToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
            />

            <main className={`flex-1 flex flex-col items-center p-4 sm:p-6 lg:p-8 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-[400px]' : 'translate-x-0'}`}>
                <div className="w-full max-w-4xl mx-auto h-full flex flex-col">
                    <Header />
                    <div className="mt-8 flex-1 overflow-y-auto">
                        {view === 'upload' ? (
                           <UploadScreen
                                targetType={targetConversionType}
                                onTargetTypeChange={setTargetConversionType}
                                preserveFolders={preserveFolders}
                                onPreserveFoldersChange={setPreserveFolders}
                                onFilesDrop={handleDroppedItems}
                                onUploadClick={handleTriggerUpload}
                                isDragging={isDragging}
                           />
                        ) : (
                            <div className="flex flex-col items-center w-full">
                                <FileList files={processedFiles} />
                                <div className="flex items-center justify-center flex-wrap gap-4 mt-6">
                                    <ActionButton onClick={handleGoBack} color="gray"><BackArrowIcon/> Go Back</ActionButton>
                                    <ActionButton onClick={handleDownloadZip} disabled={!processedFiles.length} color="blue"><DownloadIcon/> Download All (.zip)</ActionButton>
                                    <ActionButton onClick={handleDownloadAsTxt} disabled={!processedFiles.length} color="purple"><TextFileIcon/> Download as .txt</ActionButton>
                                    <ActionButton onClick={handleClear} disabled={!processedFiles.length} color="red"><ClearIcon/> Clear All</ActionButton>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;