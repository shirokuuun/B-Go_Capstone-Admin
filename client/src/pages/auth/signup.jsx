import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signupAdmin } from "/src/pages/auth/authService.js";
import Silk from "/src/components/Silk/Silk.jsx";
import "./signup.css";
import signupVisual from "/src/assets/signup-visual.jpg";

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
      {/* Silk Shader Background */}
      <Silk
        speed={5}
        scale={1}
        color="#007c91"
        noiseIntensity={1.5}
        rotation={0}
      />
      <div className="signup-wrapper">
        {/* Left side - image */}
        <div className="signup-box left">
          <img
            src={signupVisual}
            alt="Signup Visual"
            className="signup-image"
          />
        </div>

        {/* Right side - form */}
        <div className="signup-box right">
          <div className="signup-logo">
            {/* You would put your logo image here */}
            {/* Example: <img src="/path/to/your/logo.png" alt="Company Logo" /> */}
          </div>
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
            <p className="error">{error || "\u00A0"}</p>
          </form>

          <div className="signup-footer">
            <p>Already have an Admin account? <Link to="/login">Login here</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;