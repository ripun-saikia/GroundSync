import './style.css'
import { subscribeToAuth, logout } from './firebase/auth';
import { getLocations, getPosts, getUserFollows, followLocation, unfollowLocation, seedDatabase } from './firebase/db';

let currentUser = null;
let allLocations = [];
let followedLocationIds = new Set();
let currentFilterId = null; // null = My Feed, string = View specific location

// 1. Auth Guard
subscribeToAuth(async (user) => {
    if (!user) {
        window.location.href = '/index.html';
        return;
    }
    currentUser = user;
    document.getElementById('user-display-name').textContent = user.displayName;

    // Seed & Load
    await seedDatabase();
    await loadInitialData();
});

document.getElementById('logout-btn').addEventListener('click', async () => await logout());

// Search Handler
document.getElementById('location-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allLocations.filter(loc =>
        loc.name.toLowerCase().includes(term) ||
        loc.type.toLowerCase().includes(term)
    );
    renderLocations(filtered);
});

// 2. Data Loading
async function loadInitialData() {
    const [locations, follows] = await Promise.all([
        getLocations(),
        getUserFollows(currentUser.uid)
    ]);

    allLocations = locations;
    followedLocationIds = new Set(follows);

    renderLocations(allLocations);
    refreshFeed();
}

async function refreshFeed() {
    const container = document.getElementById('posts-list');
    container.innerHTML = '<p>Loading posts...</p>';

    let posts = [];
    let title = "Your Feed";

    if (currentFilterId) {
        // VIEWING SPECIFIC LOCATION (Double Click or Filter)
        const loc = allLocations.find(l => l.id === currentFilterId);
        title = loc ? `Activity in ${loc.name}` : 'Location Activity';
        posts = await getPosts([currentFilterId]);

        // Add "Back to Home" button
        document.querySelector('.feed-content h2').innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <button id="back-feed-btn" class="btn" style="background: #e0e0e0; color: #333; padding: 6px 12px; font-size: 0.85rem; border: none;">← Back</button>
                <span>${title}</span>
            </div>
        `;
        document.getElementById('back-feed-btn').addEventListener('click', window.clearFilter);

    } else {
        // MY FEED
        document.querySelector('.feed-content h2').innerHTML = "Your Feed";

        // Strict Mode: If no follows, empty state
        if (followedLocationIds.size === 0) {
            renderEmptyState("Follow a location to see posts.");
            return;
        }

        const idsToFetch = Array.from(followedLocationIds).slice(0, 10);
        try {
            posts = await getPosts(idsToFetch);
        } catch (e) {
            console.error("Error fetching feed:", e);
            renderEmptyState(`Error loading posts: ${e.message}`);
            return;
        }
    }

    renderPosts(posts);
}

function renderEmptyState(msg) {
    const container = document.getElementById('posts-list');
    container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px; background: white;">
            <p style="color: #666; font-size: 1.1rem;">${msg || "No posts yet."}</p>
        </div>
    `;
}

function renderLocations(locations) {
    const container = document.getElementById('locations-list');

    if (locations.length === 0) {
        container.innerHTML = '<p style="color:#666; font-size:0.9rem; padding:8px;">No matching locations found.</p>';
        return;
    }

    container.innerHTML = locations.map(loc => {
        const isFollowing = followedLocationIds.has(loc.id);
        const isSelected = currentFilterId === loc.id;
        const postCount = loc.postCount || 0;

        return `

            <div class="location-item" 
                style="
                display: flex; justify-content: space-between; align-items: start;
                padding: 10px; border-radius: 6px; margin-bottom: 4px; border: 1px solid transparent;
                background-color: ${isSelected ? '#e8eaf6' : 'white'};
                border-color: ${isSelected ? 'var(--color-primary)' : 'transparent'};
                transition: all 0.2s; cursor: default; user-select: none;
            ">
                <div style="flex: 1; margin-right: 8px;">
                    <div style="font-weight: 600; color: ${isSelected ? 'var(--color-primary)' : 'inherit'}">${loc.name}</div>
                    <div style="font-size: 0.75rem; color: #666;">${loc.type} • ${postCount} posts</div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px; min-width: 80px;">
                    <button 
                        class="btn btn-xs ${isFollowing ? 'btn-outline' : 'btn-primary'}" 
                        style="
                            color: ${isFollowing ? 'var(--color-primary)' : 'white'}; 
                            border: 1px solid ${isFollowing ? 'var(--color-primary)' : 'transparent'};
                        "
                        onclick="window.toggleFollow('${loc.id}', event)"
                    >
                        ${isFollowing ? 'Following' : 'Follow'}
                    </button>

                    <button 
                         class="btn btn-xs btn-secondary"
                         onclick="window.viewLocation('${loc.id}')"
                    >
                        Check Post
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderPosts(posts) {
    const container = document.getElementById('posts-list');

    if (posts.length === 0) {
        renderEmptyState(`No posts found for this location.`);
        return;
    }

    // Map location IDs to names
    const locMap = allLocations.reduce((acc, l) => ({ ...acc, [l.id]: l.name }), {});

    container.innerHTML = posts.map(post => {
        const date = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';
        return `
            <div class="card post-card">
                <div class="post-header" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="avatar" style="width: 32px; height: 32px; background: #eee; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; color: #555;">
                            ${post.authorName ? post.authorName[0].toUpperCase() : '?'}
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 0.9rem;">${post.authorName || 'Anonymous'}</div>
                            <div style="font-size: 0.8rem; color: #666;">
                                <span style="font-weight: 500; color: var(--color-primary);">${post.locationName || locMap[post.locationId] || 'Unknown'}</span> 
                                • ${date}
                            </div>
                        </div>
                    </div>
                    <div class="badge" style="font-size: 0.7rem; background: #f0f0f0; padding: 2px 8px; border-radius: 99px; height: fit-content;">
                        ${post.category || 'General'}
                    </div>
                </div>
                <h3 style="font-size: 1.1rem; margin-bottom: 6px;">${post.title}</h3>
                <p style="color: #333; margin-bottom: 12px; line-height: 1.5;">${post.content}</p>
                
                <a href="/discussion.html?id=${post.id}" class="btn btn-outline" style="border-color: var(--color-accent); color: var(--color-accent); font-size: 0.8rem; padding: 4px 12px; text-decoration: none; display: inline-block;">
                    Discuss
                </a>
            </div>
        `;
    }).join('');
}

// Global Actions
window.toggleFollow = async (locationId, event) => {
    if (event) event.stopPropagation();

    if (followedLocationIds.has(locationId)) {
        await unfollowLocation(currentUser.uid, locationId);
        followedLocationIds.delete(locationId);
    } else {
        await followLocation(currentUser.uid, locationId);
        followedLocationIds.add(locationId);
    }

    renderLocations(allLocations);
    if (!currentFilterId) refreshFeed();
};

window.viewLocation = (locationId) => {
    console.log("View Location Triggered for:", locationId);
    currentFilterId = locationId;
    renderLocations(allLocations);
    refreshFeed();
};

window.clearFilter = () => {
    currentFilterId = null;
    renderLocations(allLocations);
    refreshFeed();
};
