import React from "react";
import "./LoadingSpinner.css";

const LoadingSpinner = ({
  size = "medium",
  text = "Loading...",
  fullScreen = false,
  className = "",
}) => {
  const spinnerClasses = [
    "loading-spinner",
    `loading-spinner--${size}`,
    fullScreen ? "loading-spinner--fullscreen" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={spinnerClasses}>
      <div className="loading-spinner__container">
        <div className="loading-spinner__spinner"></div>
        {text && <p className="loading-spinner__text">{text}</p>}
      </div>
    </div>
  );
};

export default LoadingSpinner;
