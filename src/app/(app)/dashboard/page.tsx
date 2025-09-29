'use client';

import { useState, useMemo, ChangeEvent, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { File, Search, Upload, FileUp, X, FolderSearch, Download, ShieldAlert, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

import { useToast } from '@/hooks/use-toast';
import type { EncryptedFile } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const STORAGE_KEY_PREFIX = 'fortress_encrypted_files_';
const MAX_FILE_SIZE_MB = 5;
const MAX_TOTAL_STORAGE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_STORAGE_BYTES = MAX_TOTAL_STORAGE_MB * 1024 * 1024;


// --- Web Crypto API Helpers ---

// Generate a random AES-GCM key
const generateKey = async (): Promise<CryptoKey> => {
  return await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // exportable
    ['encrypt', 'decrypt']
  );
};

// Convert buffer to base64
const bufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Convert base64 to buffer
const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// Encrypt file content
const encryptFile = async (file: File) => {
  const key = await generateKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const fileBuffer = await file.arrayBuffer();

  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    fileBuffer
  );
  
  const exportedKey = await window.crypto.subtle.exportKey('jwk', key);

  return {
    encryptedContentB64: bufferToBase64(encryptedContent),
    keyB64: bufferToBase64(new TextEncoder().encode(JSON.stringify(exportedKey))),
    ivB64: bufferToBase64(iv),
  };
};

// Decrypt file content
const decryptFile = async (encryptedContentB64: string, keyB64: string, ivB64: string): Promise<ArrayBuffer> => {
    const keyData = JSON.parse(new TextDecoder().decode(base64ToBuffer(keyB64)));
    const key = await window.crypto.subtle.importKey(
        'jwk',
        keyData,
        { name: 'AES-GCM' },
        true,
        ['decrypt']
    );
    const iv = base64ToBuffer(ivB64);
    const encryptedContent = base64ToBuffer(encryptedContentB64);

    return await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encryptedContent
    );
};


export default function DashboardPage() {
  const [files, setFiles] = useState<EncryptedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState<string | null>(null); // store decrypting file id
  const [username, setUsername] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const storedUsername = localStorage.getItem('fortress_user');
    if (!storedUsername) {
      router.push('/login');
    } else {
      setUsername(storedUsername);
    }
  }, [router]);

  useEffect(() => {
    if (username) {
        try {
            const storageKey = `${STORAGE_KEY_PREFIX}${username}`;
            const storedFiles = localStorage.getItem(storageKey);
            if (storedFiles) {
            const parsedFiles = JSON.parse(storedFiles).map((file: any) => ({
                ...file,
                encryptedAt: new Date(file.encryptedAt),
            }));
            setFiles(parsedFiles);
            } else {
                setFiles([]);
            }
        } catch (error) {
            console.error("Failed to load files from local storage", error);
            toast({
            variant: 'destructive',
            title: 'Error loading files',
            description: 'Could not load previously stored files from your device.',
            });
        }
    }
  }, [username, toast]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.size > MAX_FILE_SIZE_BYTES) {
            toast({
                variant: 'destructive',
                title: 'File too large',
                description: `Please select a file smaller than ${MAX_FILE_SIZE_MB}MB.`,
              });
              if(fileInputRef.current) fileInputRef.current.value = "";
              setSelectedFile(null);
        } else {
            setSelectedFile(file);
        }
    }
  };

  const handleEncryptAndUpload = async () => {
    if (!selectedFile) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Please choose a file to encrypt and store.',
      });
      return;
    }
    
    if (!username) {
        toast({
            variant: 'destructive',
            title: 'Authentication Error',
            description: 'Cannot save file without a logged-in user.',
        });
        return;
    }

    setIsEncrypting(true);
    toast({ title: 'Encrypting...', description: 'Securing your file. Please wait.'});

    try {
        const { encryptedContentB64, keyB64, ivB64 } = await encryptFile(selectedFile);

        const newFile: EncryptedFile = {
            id: new Date().toISOString(),
            name: selectedFile.name,
            size: selectedFile.size,
            encryptedAt: new Date(),
            content: encryptedContentB64,
            key: keyB64,
            iv: ivB64,
        };

        const updatedFiles = [newFile, ...files];
        const storageKey = `${STORAGE_KEY_PREFIX}${username}`;
        
        const dataToStore = JSON.stringify(updatedFiles);
        // JS string chars are 2 bytes, but b64 is 1 byte per char. The overhead is complex.
        // A simple length check is safer and more accurate for quota purposes.
        const sizeInBytes = dataToStore.length; 

        if (sizeInBytes > MAX_TOTAL_STORAGE_BYTES) {
            toast({
                variant: 'destructive',
                title: 'Storage Quota Exceeded',
                description: `Cannot add this file. Your total stored files would exceed the ${MAX_TOTAL_STORAGE_MB}MB limit. Please delete some files first.`,
            });
            setIsEncrypting(false);
            return;
        }

        localStorage.setItem(storageKey, dataToStore);
        setFiles(updatedFiles);
      
        toast({
            title: 'File Secured',
            description: `"${selectedFile.name}" has been encrypted and stored locally.`,
        });

    } catch (error) {
        console.error("Encryption failed:", error);
        toast({
            variant: 'destructive',
            title: 'Encryption Failed',
            description: 'Could not encrypt the file. The browser might be out of storage space or an error occurred.',
        });
    } finally {
        setIsEncrypting(false);
        setSelectedFile(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }
  };

  const handleDecryptAndDownload = async (file: EncryptedFile) => {
    setIsDecrypting(file.id);
    toast({ title: 'Decrypting...', description: `Preparing "${file.name}" for download.`});

    try {
        const decryptedContent = await decryptFile(file.content, file.key, file.iv);
        const blob = new Blob([decryptedContent]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast({
            title: 'Download Started',
            description: `"${file.name}" has been decrypted and is downloading.`,
        });

    } catch(error) {
        console.error("Decryption failed:", error);
        toast({
            variant: 'destructive',
            title: 'Decryption Failed',
            description: 'Could not decrypt the file. The key may be invalid or corrupted.',
        });
    } finally {
        setIsDecrypting(null);
    }
  }

  const handleDownloadEncrypted = (file: EncryptedFile) => {
    try {
        const encryptedFileBlob = new Blob([file.content], { type: 'text/plain' });
        const url = URL.createObjectURL(encryptedFileBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.name}.encrypted`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Failed to prepare encrypted file for download:", error);
        toast({
            variant: "destructive",
            title: "Download Failed",
            description: "Could not prepare the encrypted file for download.",
        });
    }
  };

  const handleDeleteFile = (fileId: string) => {
    if(!username) return;
    const fileToDelete = files.find(f => f.id === fileId);
    if (!fileToDelete) return;
    
    const updatedFiles = files.filter(f => f.id !== fileId);
    setFiles(updatedFiles);
    const storageKey = `${STORAGE_KEY_PREFIX}${username}`;
    localStorage.setItem(storageKey, JSON.stringify(updatedFiles));
    toast({
        title: 'File Deleted',
        description: `"${fileToDelete.name}" has been removed from local storage.`,
    });
  }

  const filteredFiles = useMemo(() => {
    return files.filter((file) =>
      file.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [files, searchTerm]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const totalUsedSpace = useMemo(() => {
    if (!username) return 0;
    try {
        const storageKey = `${STORAGE_KEY_PREFIX}${username}`;
        const storedFiles = localStorage.getItem(storageKey);
        if (!storedFiles) return 0;
        // JS string chars are 2 bytes, but b64 is 1 byte per char. A simple length check is best.
        return storedFiles.length;
    } catch {
        return 0;
    }
  }, [files, username]);

  if (!username) {
    return null; // Or a loading spinner
  }

  return (
    <div className="container mx-auto space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {username}</h1>
          <p className="text-muted-foreground">Manage your secure, locally encrypted files.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Secure a New File</CardTitle>
          <CardDescription>
            Files are encrypted on your device using AES-256-GCM before being stored locally.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative flex-grow">
                    <FileUp className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="pl-10"
                        disabled={isEncrypting}
                    />
                </div>
                <Button onClick={handleEncryptAndUpload} disabled={!selectedFile || isEncrypting}>
                    <Upload className="mr-2" />
                    {isEncrypting ? 'Encrypting...' : 'Encrypt & Store'}
                </Button>
            </div>
            {selectedFile && !isEncrypting && (
                <div className="mt-4 flex items-center justify-between rounded-lg border bg-muted/50 p-2 text-sm">
                    <div className="flex items-center gap-2">
                        <File className="text-muted-foreground" />
                        <span className="font-medium">{selectedFile.name}</span>
                        <span className="text-muted-foreground">({formatBytes(selectedFile.size)})</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        setSelectedFile(null);
                        if(fileInputRef.current) fileInputRef.current.value = "";
                        }}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}
             <Alert variant="default" className="mt-4">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Local Storage Information</AlertTitle>
                <AlertDescription>
                   For this prototype, a total storage limit of {MAX_TOTAL_STORAGE_MB}MB is enforced. 
                   You have currently used {formatBytes(totalUsedSpace)} of your quota.
                </AlertDescription>
            </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locally Stored Files</CardTitle>
          <CardDescription>
            Search, view, and decrypt your files stored on this device. The search is based on the filename.
          </CardDescription>
          <div className="relative pt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by filename..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead className="hidden sm:table-cell">Size</TableHead>
                  <TableHead className="hidden md:table-cell">Encrypted On</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.length > 0 ? (
                  filteredFiles.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <File className="text-primary" />
                          <span>{file.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{formatBytes(file.size)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {new Date(file.encryptedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" disabled={isDecrypting !== null}>
                                        <Trash2 className="mr-2"/>
                                        Delete
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete your
                                        encrypted file from this browser's local storage.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteFile(file.id)}>Continue</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button 
                                        size="sm" 
                                        variant="default"
                                        disabled={isDecrypting !== null}
                                    >
                                        <Download className="mr-2" />
                                        {isDecrypting === file.id ? 'Decrypting...' : 'Download'}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleDecryptAndDownload(file)}>
                                        Decrypt & Download
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDownloadEncrypted(file)}>
                                        Download Encrypted
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                         </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <FolderSearch className="h-10 w-10"/>
                        <p className="font-medium">{searchTerm ? 'No files found.' : 'No files stored yet.'}</p>
                        <p className="text-sm">{searchTerm ? 'Try a different search term.' : 'Upload a file to get started.'}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
