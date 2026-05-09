"use client";

import React, { useEffect, useState } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { useChat } from "@/contexts/ChatContext";

export default function ChatPage() {
    const { chats, loading, createChat, selectChat, currentChat } = useChat();
    const [initialized, setInitialized] = useState(false);

    // Create or select a chat on first load
    useEffect(() => {
        if (!initialized && !loading) {
            requestAnimationFrame(() => {
                setInitialized(true);
                if (!currentChat) {
                    const first = chats[0];
                    if (first) {
                        selectChat(first.id);
                    } else {
                        createChat();
                    }
                }
            });
        }
    }, [initialized, currentChat, loading, chats, createChat, selectChat]);

    // If data loads later, select the latest chat when empty.
    useEffect(() => {
        if (loading || !initialized) return;
        if (currentChat) return;
        const first = chats[0];
        if (!first) return;
        selectChat(first.id);
    }, [chats, currentChat, initialized, loading, selectChat]);

    return <ChatLayout />;
}
