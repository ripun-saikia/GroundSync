import './style.css';
import { subscribeToAuth } from './firebase/auth';
import { getPost, subscribeToDiscussions, addDiscussion, toggleHype, getHypeStatus } from './firebase/db';

let currentUser = null;
let currentPostId = null;
let unsubscribeDiscussions = null;

// Parse Query param
const urlParams = new URLSearchParams(window.location.search);
currentPostId = urlParams.get('id');

if (!currentPostId) {
    alert("No post specified.");
    window.location.href = '/feed.html';
}

subscribeToAuth(async (user) => {
    if (!user) {
        window.location.href = '/index.html';
        return;
    }
    currentUser = user;
    document.getElementById('user-display-name').textContent = user.displayName;

    await loadPost();

    // Real-time Subscription
    if (unsubscribeDiscussions) unsubscribeDiscussions();
    unsubscribeDiscussions = subscribeToDiscussions(currentPostId, renderDiscussions);
});

// Load Original Post
async function loadPost() {
    const container = document.getElementById('original-post-container');
    const post = await getPost(currentPostId);

    if (!post) {
        container.innerHTML = '<p>Post not found.</p>';
        return;
    }

    // Check Hype Status
    const isHyped = await getHypeStatus(currentPostId, currentUser.uid);

    const date = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';

    container.innerHTML = `
        <div class="post-header" style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="avatar" style="width: 40px; height: 40px; background: #eee; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                    ${post.authorName ? post.authorName[0].toUpperCase() : '?'}
                </div>
                <div>
                    <div style="font-weight: 600;">${post.authorName || 'Anonymous'}</div>
                    <div style="font-size: 0.85rem; color: #666;">
                        ${post.locationName || 'Unknown Location'} • ${date}
                    </div>
                </div>
            </div>
            <div class="badge" style="background: #f0f0f0; padding: 4px 10px; border-radius: 99px; height: fit-content; font-size: 0.8rem;">
                ${post.category || 'General'}
            </div>
        </div>
        
        <h2 style="margin-bottom: 8px;">${post.title}</h2>
        <p style="color: #333; line-height: 1.6; margin-bottom: 20px; font-size: 1.05rem;">${post.content}</p>

        <div style="display: flex; gap: 12px;">
            <button id="hype-btn" class="btn ${isHyped ? 'btn-primary' : 'btn-outline'}" 
                style="gap: 6px; ${!isHyped ? 'border-color: #ddd; color: #555;' : ''}">
                🔥 Hype <span id="hype-count">${post.hypeCount || 0}</span>
            </button>
        </div>
    `;

    // Bind Hype Action
    document.getElementById('hype-btn').addEventListener('click', async () => {
        const btn = document.getElementById('hype-btn');
        const countSpan = document.getElementById('hype-count');
        let count = parseInt(countSpan.textContent);

        // Optimistic UI Update
        if (btn.classList.contains('btn-primary')) {
            // Un-hype
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
            btn.style.borderColor = '#ddd';
            btn.style.color = '#555';
            countSpan.textContent = Math.max(0, count - 1);
        } else {
            // Hype
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-primary');
            btn.style.borderColor = '';
            btn.style.color = '';
            countSpan.textContent = count + 1;
        }

        await toggleHype(currentPostId, currentUser.uid);
    });
}

// Render Callback
function renderDiscussions(discussions) {
    const list = document.getElementById('discussion-feed');

    if (discussions.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 30px; background: white; border-radius: 8px; border: 1px dashed #ddd;">
                <p style="color: #888;">Be the first to start the discussion.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = discussions.map(d => {
        const date = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString() : 'Just now';

        let mediaHtml = '';
        if (d.mediaUrl) {
            if (d.mediaType === 'image') {
                mediaHtml = `<img src="${d.mediaUrl}" style="max-width: 100%; max-height: 300px; border-radius: 8px; margin-top: 8px;">`;
            } else {
                mediaHtml = `<video src="${d.mediaUrl}" controls style="max-width: 100%; max-height: 300px; border-radius: 8px; margin-top: 8px;"></video>`;
            }
        }

        return `
            <div class="card" style="padding: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="font-size: 0.95rem;">${d.userName || 'User'}</strong>
                    <span style="font-size: 0.8rem; color: #888;">${date}</span>
                </div>
                <p style="color: #444; margin-bottom: 0;">${d.content}</p>
                ${mediaHtml}
            </div>
        `;
    }).join('');

    // Auto-scroll to bottom?
    // list.scrollTop = list.scrollHeight; 
}

// Media Upload UX
const mediaInput = document.getElementById('media-input');
const mediaBtn = document.getElementById('media-btn');
const fileName = document.getElementById('file-name');

mediaBtn.addEventListener('click', () => mediaInput.click());

mediaInput.addEventListener('change', () => {
    if (mediaInput.files.length > 0) {
        fileName.textContent = mediaInput.files[0].name;
        mediaBtn.classList.add('btn-primary');
        mediaBtn.classList.remove('btn-outline');
        mediaBtn.style.color = 'white';
    } else {
        fileName.textContent = '';
        mediaBtn.classList.remove('btn-primary');
        mediaBtn.classList.add('btn-outline');
        mediaBtn.style.color = '#555';
    }
});

// Submit Discussion
document.getElementById('discussion-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = document.getElementById('comment-input').value.trim();
    const file = mediaInput.files[0];

    if (!content && !file) {
        alert("Please write a message or upload media.");
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Sending...";
    submitBtn.disabled = true;

    try {
        await addDiscussion(currentPostId, currentUser.uid, currentUser.displayName, content, file);

        // Reset Form
        document.getElementById('comment-input').value = '';
        mediaInput.value = '';
        fileName.textContent = '';
        mediaBtn.classList.remove('btn-primary');
        mediaBtn.classList.add('btn-outline');
        mediaBtn.style.color = '#555';

        // No manual reload needed - Real-time listener handles it!

    } catch (error) {
        console.error("Submission Error:", error);

        let msg = error.message;
        if (error.code === 'storage/unauthorized') {
            msg = "Permission Denied. Please run: firebase deploy --only storage";
        } else if (error.code === 'storage/object-not-found') {
            msg = "Storage not configured. Check Firebase Console.";
        }

        alert(`Failed to send: ${msg}`);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});
