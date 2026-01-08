import { db, storage } from "./config";
import { collection, addDoc, getDocs, getDoc, query, where, orderBy, serverTimestamp, doc, setDoc, deleteDoc, updateDoc, increment, runTransaction, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ... existing code ...

// --- Seeding Data (One-time run logic) ---

const DEMO_LOCATIONS = [
    { name: "Jorhat", type: "city", postCount: 0 },
    { name: "JIST Campus", type: "college", postCount: 0 },
    { name: "Titabor", type: "city", postCount: 0 },
    { name: "Gandhi Park", type: "community", postCount: 0 }
];

const DEMO_POSTS = [
    { loc: "Jorhat", user: "XYZ", content: "Clean the city on Sunday" },
    { loc: "JIST Campus", user: "Angela", content: "Organising a protest for not having good water in college hostel" },
    { loc: "Titabor", user: "Ripun", content: "Celebrating birthday on 5th July" },
    { loc: "Gandhi Park", user: "Rahul", content: "Planting some trees in Gandhi Park on 5th June" }
];

export const seedDatabase = async () => {
    // 1. Seed Locations
    const locSnap = await getDocs(collection(db, "locations"));
    let locMap = {}; // name -> id

    if (locSnap.empty) {
        console.log("Seeding Locations...");
        for (const loc of DEMO_LOCATIONS) {
            const ref = await addDoc(collection(db, "locations"), { ...loc, createdAt: serverTimestamp() });
            locMap[loc.name] = ref.id;
        }
    } else {
        locSnap.forEach(d => locMap[d.data().name] = d.id);
    }

    // 2. Seed Posts (only if no posts exist to prevent dupes on reload)
    const postSnap = await getDocs(collection(db, "posts"));
    if (postSnap.empty) {
        console.log("Seeding Posts...");
        for (const p of DEMO_POSTS) {
            const locId = locMap[p.loc];
            if (locId) {
                // Create post
                await addDoc(collection(db, "posts"), {
                    userId: "demo_user", // placeholder
                    authorName: p.user,
                    locationId: locId,
                    locationName: p.loc, // cache name
                    title: "Demo Post", // generic title as not specified
                    content: p.content,
                    createdAt: serverTimestamp(),
                    likes: 0
                });
                // Increment count
                const locRef = doc(db, "locations", locId);
                await updateDoc(locRef, { postCount: increment(1) });
            }
        }
    }
};

// --- Locations ---

export const getLocations = async () => {
    const q = query(collection(db, "locations"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Find or Create Location
export const ensureLocation = async (name, category) => {
    // Case-insensitive check would be better, but strict name query for now
    const q = query(collection(db, "locations"), where("name", "==", name));
    const snap = await getDocs(q);

    if (!snap.empty) {
        return snap.docs[0].id; // Return existing ID
    }

    // Create new
    const ref = await addDoc(collection(db, "locations"), {
        name: name,
        type: category || "Other",
        postCount: 0,
        createdAt: serverTimestamp()
    });
    return ref.id;
};

// --- Posts ---

export const createPost = async (userId, locationId, locationName, category, title, content, authorName) => {
    // Run as transaction to ensure count update
    return runTransaction(db, async (transaction) => {
        // 1. Create Post
        const postRef = doc(collection(db, "posts"));
        transaction.set(postRef, {
            userId,
            locationId,
            locationName,
            category, // Store category/tag
            title: title || "Untitled",
            content,
            authorName,
            createdAt: serverTimestamp(),
            likes: 0
        });

        // 2. Increment Location Count
        const locRef = doc(db, "locations", locationId);
        transaction.update(locRef, { postCount: increment(1) });
    });
};

export const getPosts = async (locationIds = []) => {
    let q;

    // If specific locations requested
    if (locationIds && locationIds.length > 0) {
        // Firestore 'in' limitation: max 10
        const chunk = locationIds.slice(0, 10);
        // REMOVED orderBy("createdAt", "desc") to avoid needing a Composite Index for 'in' queries
        q = query(collection(db, "posts"), where("locationId", "in", chunk));
    } else if (locationIds && locationIds.length === 0 && arguments.length > 0) {
        // Explicit empty array (Follow-only feed with no follows) -> Empty result
        return [];
    } else {
        // No arg -> Fetch all (Admin/Explore view)
        q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    }

    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Client-side sort to fix missing index issue
    return posts.sort((a, b) => {
        const tA = a.createdAt ? a.createdAt.seconds : 0;
        const tB = b.createdAt ? b.createdAt.seconds : 0;
        return tB - tA;
    });
};

// --- Follows ---

export const followLocation = async (userId, locationId) => {
    const id = `${userId}_${locationId}`;
    await setDoc(doc(db, "follows", id), {
        userId,
        locationId,
        createdAt: serverTimestamp()
    });
};

export const unfollowLocation = async (userId, locationId) => {
    const id = `${userId}_${locationId}`;
    await deleteDoc(doc(db, "follows", id));
};

export const getUserFollows = async (userId) => {
    const q = query(collection(db, "follows"), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data().locationId);
};

// --- Discussions & Hype ---

export const getPost = async (postId) => {
    const docRef = doc(db, "posts", postId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return { id: snap.id, ...snap.data() };
    }
    return null;
};

export const uploadMedia = async (file, postId) => {
    if (!file) return null;
    const fileRef = ref(storage, `discussion_media/${postId}/${Date.now()}_${file.name}`);

    // Add timeout to prevent hanging indefinitely
    const uploadPromise = uploadBytes(fileRef, file);
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Upload timed out. check your internet or rules deployment.")), 15000)
    );

    await Promise.race([uploadPromise, timeoutPromise]);
    return await getDownloadURL(fileRef);
};

export const addDiscussion = async (postId, userId, userName, content, mediaFile) => {
    console.log("Adding discussion...", { postId, userId, content, hasMedia: !!mediaFile });
    let mediaUrl = null;
    let mediaType = null;

    try {
        if (mediaFile) {
            console.log("Starting media upload...");
            mediaUrl = await uploadMedia(mediaFile, postId);
            console.log("Media uploaded:", mediaUrl);
            mediaType = mediaFile.type.startsWith('image') ? 'image' : 'video';
        }

        console.log("Saving to Firestore...");
        await addDoc(collection(db, "discussions"), {
            postId,
            userId,
            userName,
            content: content || "",
            mediaUrl,
            mediaType,
            createdAt: serverTimestamp()
        });
        console.log("Discussion saved successfully.");
    } catch (e) {
        console.error("Error in addDiscussion:", e);
        throw e; // Re-throw for UI handling
    }
};

export const getDiscussions = async (postId) => {
    const q = query(
        collection(db, "discussions"),
        where("postId", "==", postId),
        orderBy("createdAt", "asc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const subscribeToDiscussions = (postId, callback) => {
    // Client-side sort to avoid needing a Composite Index
    const q = query(
        collection(db, "discussions"),
        where("postId", "==", postId)
    );

    return onSnapshot(q, (snapshot) => {
        const discussions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Client-side sort: Oldest first (asc)
        discussions.sort((a, b) => {
            const tA = a.createdAt ? a.createdAt.seconds : 0;
            const tB = b.createdAt ? b.createdAt.seconds : 0;
            return tA - tB;
        });
        callback(discussions);
    });
};

export const toggleHype = async (postId, userId) => {
    const hypeRef = doc(db, "posts", postId, "hypes", userId);
    const postRef = doc(db, "posts", postId);

    await runTransaction(db, async (transaction) => {
        const hypeDoc = await transaction.get(hypeRef);

        if (hypeDoc.exists()) {
            // Remove Hype
            transaction.delete(hypeRef);
            transaction.update(postRef, { hypeCount: increment(-1) });
        } else {
            // Add Hype
            transaction.set(hypeRef, { createdAt: serverTimestamp() });
            transaction.update(postRef, { hypeCount: increment(1) });
        }
    });
};

export const getHypeStatus = async (postId, userId) => {
    const hypeRef = doc(db, "posts", postId, "hypes", userId);
    const snap = await getDoc(hypeRef);
    return snap.exists();
};
