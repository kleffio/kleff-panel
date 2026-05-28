"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mail, Search, Loader2, User } from "lucide-react";
import { searchUsers, type UserSearchResultDTO } from "@/lib/api/namespaces";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  value: string;
  onChange: (email: string) => void;
  placeholder?: string;
}

export function SmartInviteInput({
  value,
  onChange,
  placeholder = "Email or username…",
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<UserSearchResultDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isEmail = EMAIL_RE.test(query.trim());

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await searchUsers(q);
      setResults(data.users ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (v: string) => {
    setQuery(v);
    setSelectedDisplay(null);
    onChange(""); // clear parent value until selection made
    setOpen(true);

    if (EMAIL_RE.test(v.trim())) {
      // Email detected — parent value set immediately, no user search
      onChange(v.trim());
      setResults([]);
      setLoading(false);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(() => runSearch(v.trim()), 300);
  };

  const selectUser = (user: UserSearchResultDTO) => {
    const display = user.display_name || user.slug;
    setSelectedDisplay(`${display} (@${user.slug})`);
    setQuery(user.email || user.slug);
    onChange(user.email);
    setOpen(false);
    setResults([]);
  };

  const selectEmail = () => {
    onChange(query.trim());
    setOpen(false);
    setResults([]);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showDropdown = open && query.trim().length >= 2;
  const showEmailOption = showDropdown && isEmail;
  const showUserResults = showDropdown && !isEmail;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {selectedDisplay ? (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-primary/60" />
        ) : isEmail ? (
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
        )}
        <input
          type="text"
          value={selectedDisplay ?? query}
          onChange={(e) => {
            if (selectedDisplay) {
              // User typed over a selection — reset
              setSelectedDisplay(null);
              onChange("");
            }
            handleInputChange(e.target.value);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30 animate-spin" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-white/[0.09] bg-[#141414] shadow-xl overflow-hidden">
          {showEmailOption && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectEmail(); }}
              className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                <Mail className="size-3.5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-[13px] text-white">Invite <span className="text-primary">{query.trim()}</span></p>
                <p className="text-[10px] text-white/40">Send an email invitation</p>
              </div>
            </button>
          )}

          {showUserResults && loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-4 animate-spin text-white/30" />
            </div>
          )}

          {showUserResults && !loading && results.length === 0 && query.trim().length >= 2 && (
            <div className="py-5 text-center text-[12px] text-white/30">
              No users found for &quot;{query.trim()}&quot;
            </div>
          )}

          {showUserResults && !loading && results.map((user) => (
            <button
              key={user.user_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectUser(user); }}
              className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08] shrink-0">
                <User className="size-3.5 text-white/40" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[13px] text-white truncate">
                  {user.display_name || user.slug}
                </p>
                <p className="text-[10px] text-white/40 truncate">
                  @{user.slug}{user.email ? ` · ${user.email}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
