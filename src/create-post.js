import './style.css'
import { subscribeToAuth } from './firebase/auth';
import { createPost, getLocations, ensureLocation } from './firebase/db';

let currentUser = null;
let allLocations = [];

// Auth Guard & Load Locations
subscribeToAuth(async (user) => {
    if (!user) {
        window.location.href = '/index.html';
        return;
    }
    currentUser = user;

    // Load existing locations for autocomplete
    allLocations = await getLocations();
});

// UI Elements
const locInput = document.getElementById('location-input');
const suggestionsBox = document.getElementById('location-suggestions');

// Search Logic (Internal)
locInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (!val) {
        suggestionsBox.style.display = 'none';
        return;
    }

    const matches = allLocations.filter(l => l.name.toLowerCase().includes(val));

    if (matches.length > 0) {
        suggestionsBox.innerHTML = matches.map(l => `
            <div class="suggestion-item" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f9f9f9;">
                <div style="font-weight: 500;">${l.name}</div>
                <div style="font-size: 0.8rem; color: #888;">${l.type} • ${l.postCount || 0} posts</div>
            </div>
        `).join('');
        suggestionsBox.style.display = 'block';

        // Click Handler
        document.querySelectorAll('.suggestion-item').forEach((el, index) => {
            el.addEventListener('click', () => {
                locInput.value = matches[index].name;
                suggestionsBox.style.display = 'none';
                // Auto-select category if matches? For now keep manual or let user override
            });
        });
    } else {
        suggestionsBox.innerHTML = `
            <div style="padding: 8px 12px; color: #666; font-style: italic;">
                No matching locations. "${e.target.value}" will be created.
            </div>
        `;
        suggestionsBox.style.display = 'block';
    }
});

// Hide suggestions on outside click
document.addEventListener('click', (e) => {
    if (e.target !== locInput && e.target !== suggestionsBox) {
        suggestionsBox.style.display = 'none';
    }
});

// Validate with OpenStreetMap
async function validateLocationWithOSM(locationName) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&addressdetails=1&limit=5`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'GroundSync/1.0'
            }
        });
        if (!response.ok) throw new Error("Validation service unavailable");
        const data = await response.json();

        // If no results, it's invalid
        if (data.length === 0) return false;

        // Validation Logic:
        // We want to accept: Cities, Towns, Villages, Neighborhoods, Parks, Universities, Landmarks.
        // We want to reject: Random text, "Highway 101" (unless it's a specific spot), house numbers.

        const isValid = data.some(item => {
            console.log(`Checking result: ${item.display_name} (${item.class}/${item.type})`);

            // 1. Places (Cities, Towns, Neighborhoods) - Always Valid
            if (item.class === 'place') return true;

            // 2. Boundaries (Administrative regions) - Valid
            if (item.class === 'boundary' && item.type === 'administrative') return true;

            // 3. Leisure (Parks, Stadiums, etc.)
            if (item.class === 'leisure') {
                return ['park', 'stadium', 'playground', 'recreation_ground', 'garden', 'nature_reserve'].includes(item.type);
            }

            // 4. Amenities (Schools, Libraries, Hospitals, Community Centers)
            if (item.class === 'amenity') {
                return ['university', 'college', 'school', 'library', 'hospital', 'community_centre', 'public_building', 'townhall', 'place_of_worship'].includes(item.type);
            }

            // 5. Tourism (Museums, Attractions)
            if (item.class === 'tourism') return true;

            // 6. Natural (Beaches, Peaks, Water)
            if (item.class === 'natural') return true;

            return false;
        });

        console.log(`Validation Result for "${locationName}": ${isValid}`);
        return isValid;
    } catch (e) {
        console.warn("OSM Validation failed", e);
        // Fail safe: If we can't verify it, we assume it's invalid to prevent bad data as requested.
        return false;
    }
}

// Form Submission
document.getElementById('create-post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    const locName = document.getElementById('location-input').value.trim();
    const category = document.getElementById('location-category').value;

    if (!locName) {
        alert("Please enter a location.");
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = btn.textContent;
    btn.textContent = "Validating Location...";
    btn.disabled = true;

    try {
        // 1. Check if it matches an existing known location
        // We do a case-insensitive check against our loaded list
        const existingLoc = allLocations.find(l => l.name.toLowerCase() === locName.toLowerCase());

        if (!existingLoc) {
            // 2. Validate New Location via OSM
            const isValid = await validateLocationWithOSM(locName);
            if (!isValid) {
                alert(`"${locName}" could not be verified as a real location.\nPlease enter a valid city, neighborhood, or landmark.`);
                btn.textContent = originalBtnText;
                btn.disabled = false;
                return;
            }
        }

        btn.textContent = "Posting...";

        // 3. Ensure Location Exists (Find ID or Create New)
        // ensureLocation in db.js handles the actual Firestore creation
        const locationId = await ensureLocation(locName, category);

        // 4. Create Post
        await createPost(currentUser.uid, locationId, locName, category, title, content, currentUser.displayName);

        window.location.href = '/feed.html';
    } catch (error) {
        console.error(error);
        alert("Failed to create post: " + error.message);
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }
});
