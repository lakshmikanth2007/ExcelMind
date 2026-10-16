import React, { useState } from 'react';
import { Bot, CheckCircle2, Copy, Check, ChevronRight, ChevronDown, Sparkles } from 'lucide-react';
import { QueryResponse } from '../../api/types';
import { ClarificationCard } from './ClarificationCard';
import { FormattedAnswer } from './FormattedAnswer';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  response?: QueryResponse;
  timestamp: number;
}

interface MessageBubbleProps {
  message: ChatMessage;
  activeSheet?: string;
  onSelectSheet?: (sheetName: string) => void;
  onSelectEvidence?: (res: QueryResponse) => void;
  onClarificationOption?: (option: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  activeSheet,
  onSelectSheet,
  onSelectEvidence,
  onClarificationOption,
}) => {
  const [copied, setCopied] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  const copyAnswer = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (message.sender === 'user') {
    return (
      <div className="flex justify-end mb-5">
        <div className="max-w-[85%] sm:max-w-[70%] bg-blue-600 text-white rounded-2xl rounded-br-xs px-5 py-3.5 shadow-sm shadow-blue-500/10">
          <p className="text-sm sm:text-base font-medium leading-relaxed">{message.text}</p>
        </div>
      </div>
    );
  }

  const res = message.response;

  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-[95%] sm:max-w-[88%] w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl rounded-bl-xs p-5 sm:p-6 shadow-xs transition-colors">
        {/* Header with bot badge and copy */}
        <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Bot className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">ExcelMind AI</span>
            {res && res.result_id === 'modified' ? (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Spreadsheet Data Modified
              </span>
            ) : res && res.status === 'ok' ? (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-800">
                Verified Engine
              </span>
            ) : null}
          </div>

          <button
            onClick={copyAnswer}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Copy answer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Clean, intuitive Formatted Answer with visual cards, metrics, generated chart images, and multi-sheet context */}
        <FormattedAnswer
          text={message.text}
          response={res}
          userQuery={res?.question}
          activeSheet={activeSheet}
          onSelectSheet={onSelectSheet}
        />

        {/* Clarification Options if status=clarify */}
        {res?.status === 'clarify' && res.clarification && (
          <div className="mt-3.5">
            <ClarificationCard
              question={res.clarification.question}
              options={res.clarification.options}
              onSelectOption={(opt) => onClarificationOption?.(opt)}
            />
          </div>
        )}

        {/* Collapsible Calculation Methodology & Evidence Details */}
        {res?.evidence && res.status === 'ok' && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setShowMethodology(!showMethodology)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {showMethodology ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>{showMethodology ? 'Hide' : 'View'} verification details & source evidence ({res.evidence.matched_row_count} rows)</span>
            </button>

            {showMethodology && (
              <div className="mt-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 text-xs sm:text-sm animate-in fade-in duration-150">
                <p className="text-slate-600 dark:text-slate-400 mb-2 italic">
                  "{res.evidence.plan_plain_english || res.interpretation}"
                </p>

                {res.evidence.operation_steps && res.evidence.operation_steps.length > 0 && (
                  <ol className="list-decimal pl-4 mb-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {res.evidence.operation_steps.map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-xs">
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    Matched rows: <strong className="text-slate-900 dark:text-white">{res.evidence.matched_row_count}</strong>
                  </span>

                  {onSelectEvidence && (
                    <button
                      onClick={() => onSelectEvidence(res)}
                      className="ml-auto inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                    >
                      Inspect Source Rows in Panel
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
