export default function Button({ children, className = "", ...props }) {
  return (
    <button
      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow active:scale-95 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

