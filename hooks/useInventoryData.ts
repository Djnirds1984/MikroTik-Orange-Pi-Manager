import { useState, useEffect, useCallback } from 'react';
import type { InventoryItem } from '../types.ts';

const STORAGE_KEY = 'mikrotikInventory';

export const useInventoryData = () => {
    const [items, setItems] = useState<InventoryItem[]>([]);

    useEffect(() => {
        try {
            const storedItems = localStorage.getItem(STORAGE_KEY);
            if (storedItems) {
                setItems(JSON.parse(storedItems));
            }
        } catch (error) {
            console.error("Failed to parse inventory from localStorage", error);
            setItems([]);
        }
    }, []);

    const saveItems = useCallback((updatedItems: InventoryItem[]) => {
        // Sort by date added descending before saving
        const sortedItems = updatedItems.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
        setItems(sortedItems);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sortedItems));
    }, []);

    const addItem = (newItemData: Omit<InventoryItem, 'id' | 'dateAdded'>) => {
        const newItem: InventoryItem = {
            ...newItemData,
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            dateAdded: new Date().toISOString(),
        };
        saveItems([newItem, ...items]);
    };

    const updateItem = (updatedItem: InventoryItem) => {
        const updatedItems = items.map(item =>
            item.id === updatedItem.id ? updatedItem : item
        );
        saveItems(updatedItems);
    };
    
    const deleteItem = (itemId: string) => {
        const updatedItems = items.filter(item => item.id !== itemId);
        saveItems(updatedItems);
    };

    return { items, addItem, updateItem, deleteItem };
};
