import { v4 as uuidv4 } from 'uuid';
import Draft from '@/types/draft';
import Student from '@/types/student';
import Group from '@/types/group';

const STORAGE_KEY = 'message_drafts';

// Get all drafts
export const getDrafts = (): Draft[] => {
  if (typeof window === 'undefined') return [];
  
  const draftsJson = localStorage.getItem(STORAGE_KEY);
  if (!draftsJson) return [];
  
  try {
    const drafts = JSON.parse(draftsJson);
    return Array.isArray(drafts) ? drafts : [];
  } catch (error) {
    console.error('Error parsing drafts:', error);
    return [];
  }
};

// Save a new draft or update an existing one
export const saveDraft = (
  draftData: Omit<Draft, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Draft => {
  const drafts = getDrafts();
  const now = new Date().toISOString();
  
  let draft: Draft;
  
  // If there's an ID, update the existing draft
  if (draftData.id) {
    const index = drafts.findIndex(d => d.id === draftData.id);
    
    if (index >= 0) {
      draft = {
        ...drafts[index],
        ...draftData,
        updated_at: now
      };
      
      drafts[index] = draft;
    } else {
      // ID provided but not found, create new with the provided ID
      draft = {
        ...draftData,
        id: draftData.id,
        created_at: now,
        updated_at: now
      } as Draft;
      
      drafts.push(draft);
    }
  } else {
    // No ID provided, create a new draft
    draft = {
      ...draftData,
      id: uuidv4(),
      created_at: now,
      updated_at: now
    } as Draft;
    
    drafts.push(draft);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return draft;
};

// Get a single draft by ID
export const getDraft = (id: string): Draft | undefined => {
  const drafts = getDrafts();
  return drafts.find(draft => draft.id === id);
};

// Delete a draft
export const deleteDraft = (id: string): boolean => {
  const drafts = getDrafts();
  const filteredDrafts = drafts.filter(draft => draft.id !== id);
  
  if (filteredDrafts.length === drafts.length) {
    return false; // Draft not found
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredDrafts));
  return true;
};

// Clear form data from localStorage when a message is sent
export const clearFormData = () => {
  localStorage.removeItem('formData');
};

// Convert form data and recipients to a draft
export const formToDraft = (
  formData: any, 
  students: Student[], 
  groups: Group[]
): Omit<Draft, 'id' | 'created_at' | 'updated_at'> => {
  return {
    title: formData.title || '',
    description: formData.description || '',
    priority: formData.priority || 'low',
    is_scheduled: formData.is_scheduled || false,
    delivery_date: formData.delivery_date,
    delivery_time: formData.delivery_time,
    students,
    groups
  };
}; 