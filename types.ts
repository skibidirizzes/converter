export interface ProcessedFile {
  id: string;
  originalPath: string; // The full relative path e.g. "src/components/Button.tsx"
  newPath: string;      // The new full relative path e.g. "src/components/Button.ts"
  content: ArrayBuffer;
  originalType: string;
  newType: string;
}

// This interface is for storing the file data in a serializable format (e.g., in localStorage)
export interface SerializableFile {
  id: string;
  originalPath: string;
  newPath: string;
  content: string; // ArrayBuffer converted to a Base64 string
  originalType: string;
  newType: string;
}
