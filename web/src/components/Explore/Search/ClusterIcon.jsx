import React from 'react';

const Icon = ({ width = 24, height = 24, color = 'rgb(212, 178, 151)' }) => (
  <svg
    width={width}
    height={height}
    viewBox="-0.26 -0.24 0.04 0.04"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      className="hull"
      d="M-0.235,-0.213L-0.231,-0.228L-0.252,-0.221L-0.253,-0.221L-0.252,-0.216L-0.241,-0.213Z"
      strokeWidth="0.00009755728689107555"
      style={{
        fill: 'none',
        stroke: color,
        strokeWidth: '0.0025',
        opacity: 0.75,
      }}
    />
  </svg>
);

export default Icon;
