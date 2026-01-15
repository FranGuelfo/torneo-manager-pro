import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC1i4laBrEiRkczfKGOVyKth0bRcohhjM4",
  authDomain: "play-torneo-app.firebaseapp.com",
  projectId: "play-torneo-app",
  storageBucket: "play-torneo-app.firebasestorage.app",
  messagingSenderId: "482893933606",
  appId: "1:482893933606:web:7d2581ac4820b230924ae7"
};

const app = initializeApp(firebaseConfig);

// 2. Inicializamos los servicios
export const db = getFirestore(app);
export const auth = getAuth(app);