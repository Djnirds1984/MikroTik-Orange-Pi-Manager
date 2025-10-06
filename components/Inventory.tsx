import React, { useState, useEffect, useMemo } from 'react';
import type { InventoryItem } from '../types.ts';
import { EditIcon, TrashIcon, SearchIcon, ArchiveBoxIcon } from '../constants.tsx';

// --- Form Modal for Add/Edit Item ---
interface ItemFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: InventoryItem | Omit<InventoryItem, 'id' | 'dateAdded'>) => void;
    initialData: InventoryItem | null;
}

const ItemFormModal: React.FC<ItemFormModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [item, setItem] = useState({ name: '', quantity: 1, price: '', serialNumber: '' });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setItem({
                    name: initialData.name,
                    quantity: initialData.quantity,
                    price: initialData.price?.toString() || '',
                    serialNumber: initialData.serialNumber || '',
                });
            } else {
                setItem({ name: '', quantity: 1, price: '', serialNumber: '' });
            }
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setItem(prev => ({
            ...prev,
            [name]: type === 'number' ? parseInt(value, 10) || 0 : value
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dataToSave = {
            ...item,
            price: item.price ? parseFloat(item.price) : undefined,
            quantity: Number(item.quantity),
        };

        if (initialData) {
            onSave({ ...initialData, ...dataToSave });
        } else {
            onSave(dataToSave);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-700">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-4">{initialData ? 'Edit Item' : 'Add New Item'}</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Item Name</label>
                                    <input type="text" name="name" id="name" value={item.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" placeholder="e.g., UBNT LiteBeam" />
                                </div>
                                <div>
                                    <label htmlFor="quantity" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Quantity</label>
                                    <input type="number" name="quantity" id="quantity" value={item.quantity} onChange={handleChange} required min="0" className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="price" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Price (Optional)</label>
                                    <input type="number" name="price" id="price" value={item.price} onChange={handleChange} min="0" step="0.01" className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" placeholder="e.g., 99.99" />
                                </div>
                                <div>
                                    <label htmlFor="serialNumber" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Serial Number (Optional)</label>
                                    <input type="text" name="serialNumber" id="serialNumber" value={item.serialNumber} onChange={handleChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" placeholder="For devices like modems" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500]">
                            Save Item
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- Main Component ---
interface InventoryProps {
    items: InventoryItem[];
    addItem: (item: Omit<InventoryItem, 'id' | 'dateAdded'>) => void;
    updateItem: (item: InventoryItem) => void;
    deleteItem: (itemId: string) => void;
}

export const Inventory: React.FC<InventoryProps> = ({ items, addItem, updateItem, deleteItem }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredItems = useMemo(() => {
        if (!searchTerm.trim()) {
            return items;
        }
        const lowerCaseTerm = searchTerm.toLowerCase();
        return items.filter(item =>
            item.name.toLowerCase().includes(lowerCaseTerm) ||
            (item.serialNumber && item.serialNumber.toLowerCase().includes(lowerCaseTerm))
        );
    }, [items, searchTerm]);
    
    const handleSave = (itemData: InventoryItem | Omit<InventoryItem, 'id' | 'dateAdded'>) => {
        if ('id' in itemData) {
            updateItem(itemData);
        } else {
            addItem(itemData);
        }
        setIsModalOpen(false);
    };

    const handleEdit = (item: InventoryItem) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };
    
    const handleAdd = () => {
        setEditingItem(null);
        setIsModalOpen(true);
    }
    
    const handleDelete = (itemId: string) => {
        if (window.confirm("Are you sure you want to delete this item from your inventory?")) {
            deleteItem(itemId);
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <ItemFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingItem}
            />
            
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Stock & Inventory</h2>
                <div className="flex items-center gap-4">
                     <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <SearchIcon className="h-5 w-5 text-slate-400" />
                        </span>
                        <input
                            type="text"
                            placeholder="Search by name or serial..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 pl-10 pr-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[--color-primary-500]"
                        />
                    </div>
                    <button onClick={handleAdd} className="bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">
                        Add New Item
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3">Item Name</th>
                                <th className="px-6 py-3 text-center">Quantity</th>
                                <th className="px-6 py-3">Price</th>
                                <th className="px-6 py-3">Serial Number</th>
                                <th className="px-6 py-3">Date Added</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.length > 0 ? filteredItems.map(item => (
                                <tr key={item.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{item.name}</td>
                                    <td className="px-6 py-4 text-center font-mono text-cyan-600 dark:text-cyan-400">{item.quantity}</td>
                                    <td className="px-6 py-4 font-mono text-green-600 dark:text-green-400">{item.price ? `$${item.price.toFixed(2)}` : <span className="text-slate-500">N/A</span>}</td>
                                    <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{item.serialNumber || <span className="text-slate-500">N/A</span>}</td>
                                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{new Date(item.dateAdded).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-right space-x-1">
                                        <button onClick={() => handleEdit(item)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-[--color-primary-500] dark:hover:text-[--color-primary-400] rounded-md" title="Edit Item">
                                            <EditIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md" title="Delete Item">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-slate-500">
                                        {items.length > 0 ? 'No items found matching your search.' : 'Your inventory is empty. Add an item to get started.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
             {items.length === 0 && (
                <div className="text-center mt-8">
                     <ArchiveBoxIcon className="w-16 h-16 text-slate-400 dark:text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-500">Keep track of your physical hardware like modems, routers, and cables.</p>
                </div>
            )}
        </div>
    );
};
