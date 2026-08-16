import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

export const firebaseConfig = {
  apiKey: "AIzaSyAFi5v5jY69l-RA8T__txuaS3FQvymmtk4",
  authDomain: "my-draft-board-84fb8.firebaseapp.com",
  databaseURL: "https://my-draft-board-84fb8-default-rtdb.firebaseio.com",
  projectId: "my-draft-board-84fb8",
  storageBucket: "my-draft-board-84fb8.firebasestorage.app",
  messagingSenderId: "228213986471",
  appId: "1:228213986471:web:9ef3636da10e4712317782",
  measurementId: "G-KXGWNW4LLS"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
