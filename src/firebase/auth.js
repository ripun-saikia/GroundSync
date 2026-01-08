import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Check if user exists in Firestore
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // Create new user doc
            await setDoc(userRef, {
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: serverTimestamp()
            });
        }

        return user;
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
};

export const logout = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed:", error);
    }
};

export const subscribeToAuth = (callback) => {
    return onAuthStateChanged(auth, callback);
};
