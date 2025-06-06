export const LupaIcon = ({ fill = "none" }: { fill?: string }) => {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill={fill}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="46" height="46" rx="11" fill="white" />
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx="11"
        stroke="black"
        strokeWidth="2"
      />
      <path
        d="M31.4936 31.539C32.009 31.0271 32.8351 31.0271 33.3505 31.539L36.7567 34.2885H36.8158C37.505 34.985 37.505 36.1144 36.8158 36.8109C36.1267 37.5074 35.0094 37.5074 34.3203 36.8109L31.4936 33.5712L31.3864 33.4502C31.1865 33.1973 31.0762 32.882 31.0762 32.5551C31.0762 32.1738 31.2264 31.8082 31.4936 31.539ZM22.1029 10.6666C25.1361 10.6666 28.0451 11.8845 30.1899 14.0524C32.3348 16.2203 33.5397 19.1607 33.5397 22.2265C33.5397 28.6109 28.4193 33.7864 22.1029 33.7864C15.7865 33.7864 10.666 28.6109 10.666 22.2265C10.666 15.8422 15.7865 10.6666 22.1029 10.6666Z"
        fill="#200E32"
      />
      <circle cx="22" cy="22" r="9" fill="white" />
    </svg>
  );
};
