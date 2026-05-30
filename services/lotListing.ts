import API from "@/lib/api";

export interface LotListingLot {
  lot_id: string;
  lot_number: number;
  title?: string;
  description?: string;
  details?: string;
  damage_analysis?: string;
  condition_report_specs?: Record<string, string>;
  lotted_by?: string;
  condition_report_selections?: {
    condition?: string;
    completeness?: string;
    legal?: string;
  };
  estimated_value?: string;
  quantity?: number;
  must_take?: boolean;
  categories?: string;
  serial_number?: string;
  show_on_website?: boolean;
  close_date?: string;
  bid_increment?: number;
  location?: string;
  opening_bid?: number;
  latitude?: number;
  longitude?: number;
  item_condition?: string;
  image_indexes: number[];
  image_urls?: string[];
  extra_image_indexes?: number[];
  extra_image_urls?: string[];
  cover_index?: number;
  sub_mode?: string;
  tags?: string[];
}

export interface LotListingPreviewFiles {
  excel?: string;
  images?: string;
}

export interface LotListing {
  _id: string;
  user: string;
  status: "processing" | "preview" | "pending_approval" | "approved" | "declined" | "error";
  job_id?: string;
  job_status?: "queued" | "processing" | "done" | "error";
  job_error?: string;
  error_message?: string;
  files_generating?: boolean;
  files_regenerating?: boolean;
  progress?: {
    phase: string;
    percent: number;
    message?: string;
  };
  details?: {
    contract_no?: string;
    sales_date?: string;
    location?: string;
    currency?: string;
  };
  lots?: LotListingLot[];
  imageUrls?: string[];
  preview_data?: {
    contract_no?: string;
    sales_date?: string;
    location?: string;
    currency?: string;
    lots?: LotListingLot[];
    total_value?: number;
  };
  preview_files?: LotListingPreviewFiles;
  decline_reason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LotListingProgress {
  phase: string;
  percent?: number;
  serverProgress01?: number;
  message?: string;
  result?: {
    reportId?: string;
    reportType?: string;
    status?: string;
  };
}

// Get all lot listings for current user
export async function getLotListings(): Promise<{ data: LotListing[] }> {
  const response = await API.get<{ data: LotListing[]; message?: string }>("/lot-listing");
  // Server returns { message, data }, so extract the data array
  const listings = Array.isArray(response.data) ? response.data : (response.data?.data || []);
  return { data: listings };
}

// Get lot listing by ID
export async function getLotListingById(id: string): Promise<LotListing> {
  const response = await API.get<LotListing>(`/lot-listing/${id}`);
  return response.data;
}

// Get lot listing progress
export async function getLotListingProgress(id: string): Promise<LotListingProgress> {
  const response = await API.get<LotListingProgress>(`/lot-listing/progress/${id}`);
  return response.data;
}

// Get lot listing preview
export async function getLotListingPreview(id: string): Promise<LotListing> {
  const response = await API.get<LotListing>(`/lot-listing/${id}/preview`);
  return response.data;
}

export async function getLotListingSubmittedPreview(id: string): Promise<LotListing> {
  const response = await API.get<LotListing>(`/lot-listing/${id}/submitted-preview`);
  return response.data;
}

// Update lot listing preview
export async function updateLotListingPreview(
  id: string,
  data: { preview_data?: any; lots?: LotListingLot[]; details?: LotListing["details"] }
): Promise<LotListing> {
  const response = await API.put<LotListing>(`/lot-listing/${id}/preview`, data);
  return response.data;
}

// Submit lot listing for approval
export async function submitLotListingForApproval(id: string): Promise<LotListing> {
  const response = await API.post<LotListing>(`/lot-listing/${id}/submit-approval`);
  return response.data;
}

// Resubmit lot listing (regenerate files)
export async function resubmitLotListing(id: string, data?: { preview_data?: any }): Promise<LotListing> {
  const response = await API.post<LotListing>(`/lot-listing/${id}/resubmit`, data || {});
  return response.data;
}

// Delete lot listing
export async function deleteLotListing(id: string): Promise<void> {
  await API.delete(`/lot-listing/${id}`);
}

// Get submitted lot listings (pending_approval and approved)
export async function getSubmittedLotListings(): Promise<{ data: LotListing[] }> {
  const response = await API.get<{ data: LotListing[]; message?: string }>("/lot-listing");
  // Server returns { message, data }, so extract the data array
  const listings = Array.isArray(response.data) ? response.data : (response.data?.data || []);
  const submitted = listings.filter(
    (r) =>
      r.status === "pending_approval" ||
      r.status === "approved" ||
      (r.status === "processing" && (r.files_generating || r.files_regenerating))
  );
  return { data: submitted };
}

export const LotListingService = {
  getLotListings,
  getLotListingById,
  getLotListingProgress,
  getLotListingPreview,
  getLotListingSubmittedPreview,
  updateLotListingPreview,
  submitLotListingForApproval,
  resubmitLotListing,
  deleteLotListing,
  getSubmittedLotListings,
};

export default LotListingService;
