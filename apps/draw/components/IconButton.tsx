import { ReactNode, useState } from "react";

export function IconButton({
  icon,
  onClick,
  activated,
  tooltip,
}: {
  icon: ReactNode;
  onClick: () => void;
  activated: boolean;
  tooltip?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 ${
          activated
            ? "bg-blue-100 text-blue-600 shadow-sm"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"
        }`}
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {icon}
      </button>

      {tooltip && showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-50">
          {tooltip}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}
