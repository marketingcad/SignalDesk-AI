import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type PostgresEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

interface UseRealtimeOptions<T extends Record<string, unknown>> {
  table: string;
  event?: PostgresEvent;
  schema?: string;
  filter?: string;
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: { old: T; new: T }) => void;
  onDelete?: (payload: T) => void;
  onChange?: (payload: RealtimePostgresChangesPayload<T>) => void;
}

/**
 * Subscribe to Supabase Realtime postgres_changes for a table.
 * Automatically cleans up on unmount.
 */
export function useRealtime<T extends Record<string, unknown>>(
  options: UseRealtimeOptions<T>
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const {
      table,
      event = "*",
      schema = "public",
      filter,
    } = optionsRef.current;

    const channelName = `realtime-${table}-${event}-${filter ?? "all"}`;

    const channelConfig: {
      event: PostgresEvent;
      schema: string;
      table: string;
      filter?: string;
    } = { event, schema, table };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel = supabaseBrowser
      .channel(channelName)
      .on(
        "postgres_changes" as never,
        channelConfig,
        (payload: RealtimePostgresChangesPayload<T>) => {
          const opts = optionsRef.current;

          if (opts.onChange) {
            opts.onChange(payload);
          }

          if (payload.eventType === "INSERT" && opts.onInsert) {
            opts.onInsert(payload.new as T);
          } else if (payload.eventType === "UPDATE" && opts.onUpdate) {
            opts.onUpdate({
              old: payload.old as T,
              new: payload.new as T,
            });
          } else if (payload.eventType === "DELETE" && opts.onDelete) {
            opts.onDelete(payload.old as T);
          }
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [options.table, options.event, options.filter]);
}
