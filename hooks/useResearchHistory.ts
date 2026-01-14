"use client";

import { entries, set } from "idb-keyval";
import { useCallback, useEffect, useState } from "react";

export interface ResearchRecord {
  id: string;
  prompt: string;
  report: string;
  createdAt: string;
}

export function useResearchHistory() {
  const [history, setHistory] = useState<ResearchRecord[]>([]);

  const refreshHistory = useCallback(async () => {
    const allEntries = await entries<string, ResearchRecord>();
    const records = allEntries
      .map(([, value]) => value)
      .filter((value): value is ResearchRecord => Boolean(value))
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    setHistory(records);
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const saveRecord = useCallback(
    async (record: ResearchRecord) => {
      await set(record.id, record);
      await refreshHistory();
    },
    [refreshHistory]
  );

  return {
    history,
    saveRecord,
    refreshHistory
  };
}
