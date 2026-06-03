import API from "@/lib/api";

// Asset form data
export type AssetFormData = {
  clientName?: string;
  effectiveDate?: string;
  appraisalPurpose?: string;
  ownerName?: string;
  appraiser?: string;
  appraisalCompany?: string;
  industry?: string;
  inspectionDate?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  contractNo?: string;
  language?: "en" | "fr" | "es";
  currency?: string;
  includeValuationTable?: boolean;
  selectedValuationMethods?: Array<"FML" | "TKV" | "OLV" | "FLV">;
  groupingMode?: "single_lot" | "per_item" | "per_photo" | "catalogue" | "combined" | "mixed";
  combinedModes?: Array<"single_lot" | "per_item" | "per_photo">;
  preparedFor?: string;
  factorsAgeCondition?: string;
  factorsQuality?: string;
  factorsAnalysis?: string;
  includeDamageAnalysis?: boolean;
};

// Real Estate form data
export type RealEstateFormData = {
  language?: "en" | "fr" | "es";
  property_type?: "residential" | "commercial" | "agricultural";
  property_details?: {
    owner_name?: string;
    address?: string;
    land_description?: string;
    latitude?: string;
    longitude?: string;
    municipality?: string;
    title_number?: string;
  };
  report_dates?: {
    report_date?: string;
    effective_date?: string;
    inspection_date?: string;
  };
  house_details?: {
    year_built?: string;
    square_footage?: string;
    lot_size_sqft?: string;
    number_of_rooms?: string;
    number_of_full_bathrooms?: string;
    number_of_half_bathrooms?: string;
    known_issues?: string[];
  };
  farmland_details?: {
    total_title_acres?: number;
    cultivated_acres?: number;
    rm_area?: string;
    soil_class?: string;
    crop_type?: string;
    access_quality?: "excellent" | "good" | "fair" | "poor";
    distance_to_city_km?: number;
    is_rented?: boolean;
    irrigation?: boolean;
    annual_rent_per_acre?: number;
  };
};

export type SavedInputFormData = AssetFormData | RealEstateFormData;
export type FormType = "asset" | "realEstate";

export type SavedInput = {
  _id: string;
  user: string;
  name: string;
  formType: FormType;
  formData: SavedInputFormData;
  createdAt: string;
  updatedAt: string;
};

export type CreateSavedInputPayload = {
  name: string;
  formType?: FormType;
  formData: SavedInputFormData;
};

export type UpdateSavedInputPayload = {
  name?: string;
  formData?: SavedInputFormData;
};

// Draft image data type for cross-device sync (URL-based, not base64)
export type DraftImageData = {
  lotId: string;
  type: "main" | "extra" | "video";
  name: string;
  url: string; // Server file URL
  mimeType: string;
};

export type SaveDraftPayload = {
  formType?: FormType;
  formData: SavedInputFormData & { lots?: any[] };
  draftImages?: DraftImageData[];
};

export type DraftResponse = SavedInput & {
  isDraft: boolean;
  draftImages?: DraftImageData[];
};

// Upload response type
export type DraftUploadResponse = {
  message: string;
  data: DraftImageData[];
};

export const SavedInputService = {
  async create(payload: CreateSavedInputPayload): Promise<SavedInput> {
    const { data } = await API.post<{ message: string; data: SavedInput }>(
      "/saved-inputs",
      payload
    );
    return data.data;
  },

  async getAll(formType?: FormType): Promise<SavedInput[]> {
    const params = formType ? `?formType=${formType}` : "";
    const { data } = await API.get<{ message: string; data: SavedInput[] }>(
      `/saved-inputs${params}`
    );
    return data.data;
  },

  async getById(id: string): Promise<SavedInput> {
    const { data } = await API.get<{ message: string; data: SavedInput }>(
      `/saved-inputs/${id}`
    );
    return data.data;
  },

  async update(id: string, payload: UpdateSavedInputPayload): Promise<SavedInput> {
    const { data } = await API.put<{ message: string; data: SavedInput }>(
      `/saved-inputs/${id}`,
      payload
    );
    return data.data;
  },

  async delete(id: string): Promise<void> {
    await API.delete(`/saved-inputs/${id}`);
  },

  // Draft methods for cross-device sync
  async saveDraft(payload: SaveDraftPayload): Promise<DraftResponse> {
    const { data } = await API.post<{ message: string; data: DraftResponse }>(
      "/saved-inputs/draft",
      payload
    );
    return data.data;
  },

  async getDraft(formType?: FormType): Promise<DraftResponse | null> {
    try {
      const params = formType ? `?formType=${formType}` : "";
      const { data } = await API.get<{ message: string; data: DraftResponse }>(
        `/saved-inputs/draft${params}`
      );
      return data.data;
    } catch (error: any) {
      // 404 means no draft exists, which is fine
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async deleteDraft(formType?: FormType): Promise<void> {
    const params = formType ? `?formType=${formType}` : "";
    await API.delete(`/saved-inputs/draft${params}`);
  },

  // Upload draft images as files (fast, no base64 conversion)
  async uploadDraftImages(
    files: File[],
    lotId: string,
    type: "main" | "extra" | "video" = "main"
  ): Promise<DraftImageData[]> {
    const formData = new FormData();
    formData.append("lotId", lotId);
    formData.append("type", type);
    
    for (const file of files) {
      formData.append("images", file);
    }

    const { data } = await API.post<DraftUploadResponse>(
      "/saved-inputs/draft/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );
    return data.data;
  },

  // Delete all draft images for current user
  async deleteDraftImages(): Promise<void> {
    await API.delete("/saved-inputs/draft/images");
  },
};
