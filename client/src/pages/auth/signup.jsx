// src/pages/auth/Signup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signupAdmin } from "/src/pages/auth/authService.js";
import "./signup.css";

function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await signupAdmin({ name, email, password });
      navigate("/login");
    } catch (err) {
      console.error(err);
      setError("Signup failed. Try again.");
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-wrapper">
        {/* Left side - image */}
        <div className="signup-box left">
          <img src="/signup-image.jpg" alt="Signup" className="signup-image" />
        </div>

        {/* Right side - form */}
        <div className="signup-box right">
          <div className="signup-title">
            <h2>Create Admin Account</h2>
          </div>

          <form className="signup-form" onSubmit={handleSignup}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              required
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              required
            />
            <button type="submit">Sign Up</button>
            {error && <p className="error">{error}</p>}
          </form>
          <div className="signup-footer">
            <p>Already have an Admin account? <a href="/login">Login here</a></p>
        </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;
