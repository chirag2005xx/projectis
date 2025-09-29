'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


// --- Real Secure Password Handling ---
// This uses the Web Crypto API, a standard browser feature for cryptography.

// Function to convert string to an ArrayBuffer for crypto functions
const str2ab = (str: string) => {
  const buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
  const bufView = new Uint16Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
};

// Function to convert ArrayBuffer to a hex string for storage
const ab2hex = (buf: ArrayBuffer) => {
  return Array.prototype.map.call(new Uint8Array(buf), (x) => ('00' + x.toString(16)).slice(-2)).join('');
};

// Function to generate a secure hash from a password and salt
// Uses PBKDF2, a standard key derivation function, to make password cracking much harder.
const createHash = async (password: string, salt: string): Promise<string> => {
  const passwordBuffer = str2ab(password);
  const saltBuffer = str2ab(salt);

  const key = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000, // A high number of iterations is crucial for security
      hash: 'SHA-256',
    },
    key,
    256
  );

  return ab2hex(bits);
};

// Generates a random salt for each new user
const generateSalt = (): string => {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return ab2hex(array);
};

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('login');


  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!username || !password) {
        toast({
            variant: 'destructive',
            title: 'Missing Fields',
            description: 'Please provide both username and password.',
        });
        setIsSubmitting(false);
        return;
    }

    if (localStorage.getItem(`fortress_user_${username}`)) {
        toast({
            variant: 'destructive',
            title: 'Registration Failed',
            description: 'A user with this username already exists.',
        });
        setIsSubmitting(false);
        return;
    }

    try {
        // 1. Setup (Registration)
        // Generate a unique salt for the new user.
        const salt = generateSalt();
        // Hash the password with the salt. The password itself is never stored.
        const hash = await createHash(password, salt);
        
        // The server (localStorage) stores the user's info with the salt and hash.
        const user_data = { salt, hash };
        localStorage.setItem(`fortress_user_${username}`, JSON.stringify(user_data));

        toast({
            title: 'Registration Successful',
            description: 'You can now log in with your credentials.',
        });
        
        // Switch to login tab after successful registration
        setActiveTab('login');

    } catch (error) {
        console.error("Registration error:", error);
        toast({
            variant: 'destructive',
            title: 'Registration Failed',
            description: 'An unexpected error occurred. Please try again.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };


  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!username || !password) {
        toast({
            variant: 'destructive',
            title: 'Missing Fields',
            description: 'Please provide both username and password.',
        });
        setIsSubmitting(false);
        return;
    }

    try {
        // 2. Login (Authentication)
        // Retrieve the stored user data (salt and hash).
        const userDataString = localStorage.getItem(`fortress_user_${username}`);

        if (!userDataString) {
            toast({
                variant: 'destructive',
                title: 'Login Failed',
                description: 'Invalid username or password.',
            });
            setIsSubmitting(false);
            return;
        }

        const { salt, hash: storedHash } = JSON.parse(userDataString);

        // The client re-hashes the entered password with the retrieved salt.
        const hashToVerify = await createHash(password, salt);
        
        // The client compares the newly generated hash with the stored hash.
        const isVerified = hashToVerify === storedHash;

        if (isVerified) {
            // If hashes match, grant access.
            localStorage.setItem('fortress_user', username);
            router.push('/dashboard');
        } else {
            toast({
                variant: 'destructive',
                title: 'Login Failed',
                description: 'Invalid username or password.',
            });
        }
    } catch (error) {
        console.error("Login error:", error);
        toast({
            variant: 'destructive',
            title: 'Login Failed',
            description: 'An unexpected error occurred. Please try again.',
        });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <CardTitle className="text-3xl font-bold">Fortress</CardTitle>
          <CardDescription>
            Secure access using salted password hashing
          </CardDescription>
        </CardHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login"><ShieldCheck className="mr-2"/>Login</TabsTrigger>
                <TabsTrigger value="register"><UserPlus className="mr-2"/>Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
                <form onSubmit={handleLogin}>
                <CardContent className="space-y-4 pt-6">
                    <div className="space-y-2">
                    <Label htmlFor="login-username">Username</Label>
                    <Input
                        id="login-username"
                        name="username"
                        type="text"
                        placeholder="Enter your username"
                        required
                        disabled={isSubmitting}
                    />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                        id="login-password"
                        name="password"
                        type="password"
                        placeholder="Enter your password"
                        required
                        disabled={isSubmitting}
                    />
                    </div>
                    <p className="text-xs text-muted-foreground">
                    Your password will be hashed and never sent in plain text.
                    </p>
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                        {isSubmitting ? 'Verifying...' : 'Login'}
                    </Button>
                </CardFooter>
                </form>
            </TabsContent>
            <TabsContent value="register">
                <form onSubmit={handleRegister}>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="reg-username">Username</Label>
                            <Input
                                id="reg-username"
                                name="username"
                                type="text"
                                placeholder="Choose a username"
                                required
                                disabled={isSubmitting}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reg-password">Password</Label>
                            <Input
                                id="reg-password"
                                name="password"
                                type="password"
                                placeholder="Choose a strong password"
                                required
                                disabled={isSubmitting}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            A salted cryptographic hash will be stored, not your password.
                        </p>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" size="lg" variant="secondary" disabled={isSubmitting}>
                            {isSubmitting ? 'Registering...' : 'Register'}
                        </Button>
                    </CardFooter>
                </form>
            </TabsContent>
        </Tabs>
      </Card>
    </main>
  );
}

    