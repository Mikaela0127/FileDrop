export interface StoredObjectMetadata {
  contentType: string;
  sizeBytes: number;
}

export interface ObjectStore {
  deleteObject(objectKey: string): Promise<void>;
  inspectObject(objectKey: string): Promise<StoredObjectMetadata | null>;
}
