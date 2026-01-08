import './style.css'
import { loginWithGoogle, subscribeToAuth } from './firebase/auth';

// Auth State Listener
subscribeToAuth((user) => {
  if (user) {
    // Redirect to feed if logged in
    window.location.href = '/feed.html';
  }
});

// Attach Login Handler
const attachLoginHandlers = () => {
  const loginBtns = document.querySelectorAll('.sign-in-btn, .btn-primary');
  loginBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await loginWithGoogle();
        // Redirect handled by subscribeToAuth
      } catch (error) {
        alert("Login failed. See console for details.");
      }
    });
  });
};

// document.querySelector('#app').innerHTML was here, but we want to keep the static HTML from index.html

// Since main.js is a module, it runs deferred. The DOM should be ready.
attachLoginHandlers();
