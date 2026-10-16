import React from 'react';
import { HelpCircle, ChevronRight } from 'lucide-react';

interface ClarificationCardProps {
  question: string;
  options: string[];
  onSelectOption: (option: string) => void;
}

export const ClarificationCard: React.FC<ClarificationCardProps> = ({
  question,
  options,
  onSelectOption,
}) => {
  return (
    <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/40 shadow-2xs">
      <div className="flex items-center gap-2 mb-2 text-xs font-bold text-blue-900 dark:text-blue-200">
        <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        Clarification Needed
      </div>
      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mb-3">{question}</p>

      <div className="flex flex-wrap gap-2">
        {options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => onSelectOption(option)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white hover:border-blue-600 transition-all shadow-2xs flex items-center gap-1 group"
          >
            <span>{option}</span>
            <ChevronRight className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ))}
      </div>
    </div>
  );
};
