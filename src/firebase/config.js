import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyC7oElhq-KjfP8cO6sh5DN0jh0544eLPPQ",
    authDomain: "groundsync-6a30e.firebaseapp.com",
    projectId: "groundsync-6a30e",
    storageBucket: "groundsync-6a30e.firebasestorage.app",
    messagingSenderId: "337731128710",
    appId: "1:337731128710:web:d56232e016c2c249e73007",
    measurementId: "G-KCK0DL1ZTY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
