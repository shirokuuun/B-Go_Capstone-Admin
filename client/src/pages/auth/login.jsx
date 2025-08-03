import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "/src/firebase/firebase.js";
import { useNavigate } from "react-router-dom";
import { loginAdmin } from "/src/pages/auth/authService.js";
import "./login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await loginAdmin(email, password);
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <div className="login-box left">
          <div className="login-logo">
            {/* You would put your logo image here */}
            {/* Example: <img src="/path/to/your/logo.png" alt="Company Logo" /> */}
          </div>
          <div className="login-title">
            <h2>Welcome Back</h2>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <input
              type="email"
              value={email}
              placeholder="Email"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              value={password}
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">Login</button>
            <p className="error">{error || "\u00A0"}</p>
          </form>
          <div className="login-footer">
            <p>Don't have an Admin account? <a href="/signup">Register here</a></p>
          </div>
        </div>
        <div className="login-box right">
          <img
            src="/login-photo.jpg"
            alt="Login Visual"
            className="login-image"
          />
        </div>
      </div>
    </div>
  );
}

export default Login;