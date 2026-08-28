// src/services/document.service.js
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db.js';
import { documentRepository } from '../repositories/document.repository.js';
import { documentVersionRepository } from '../repositories/documentVersion.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { storageService } from './storage.service.js';
import { auditService } from './audit.service.js';
import { AppError } from '../errors/AppError.js';
import { AUDIT_ACTIONS, DOCUMENT_TYPES } from '../config/constants.js';

export class DocumentService {
  /**
   * Upload a new document and initialize Version 1 inside a transaction
   */
  async uploadDocument(organizationId, uploadedBy, file, metadata = {}, reqMeta = {}) {
    const org = await organizationRepository.findById(organizationId);
    if (!org) {
      throw AppError.notFound('Organization not found', 'ORGANIZATION_NOT_FOUND');
    }

    if (!file || !file.buffer) {
      throw AppError.badRequest('No file payload provided for upload', 'FILE_REQUIRED');
    }

    // 1. Upload to storage layer (computes SHA-256 and validates MIME)
    const storageResult = await storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      organizationId
    );

    const documentId = uuidv4();
    const versionId = uuidv4();
    const docName = metadata.name || file.originalname;
    const docType = metadata.documentType || DOCUMENT_TYPES.OTHER;

    return db.transaction(async (conn) => {
      // 2. Insert Document record
      const doc = await documentRepository.create(
        {
          id: documentId,
          organizationId,
          uploadedBy,
          name: docName,
          originalFilename: file.originalname,
          mimeType: storageResult.mimeType,
          fileSize: storageResult.fileSize,
          storageKey: storageResult.storageKey,
          documentType: docType,
          status: 'ACTIVE',
          description: metadata.description || null,
          currentVersion: 1,
        },
        conn
      );

      // 3. Insert Version 1
      await documentVersionRepository.create(
        {
          id: versionId,
          documentId,
          versionNumber: 1,
          storageKey: storageResult.storageKey,
          originalFilename: file.originalname,
          mimeType: storageResult.mimeType,
          fileSize: storageResult.fileSize,
          checksum: storageResult.checksum,
          uploadedBy,
        },
        conn
      );

      // 4. Audit log
      await auditService.log(
        {
          actorUserId: uploadedBy,
          action: AUDIT_ACTIONS.DOCUMENT_CREATED,
          resourceType: 'document',
          resourceId: documentId,
          ipAddress: reqMeta.ip,
          userAgent: reqMeta.userAgent,
          metadata: {
            organizationId,
            name: docName,
            originalFilename: file.originalname,
            fileSize: storageResult.fileSize,
            checksum: storageResult.checksum,
            documentType: docType,
            version: 1,
          },
        },
        conn
      );

      return doc;
    });
  }

  async listDocuments(organizationId, params = {}) {
    return documentRepository.listByOrganization(organizationId, params);
  }

  async getDocumentById(id, organizationId) {
    const doc = await documentRepository.findById(id, organizationId);
    if (!doc) {
      throw AppError.notFound('Document not found in organization', 'DOCUMENT_NOT_FOUND');
    }
    return doc;
  }

  async updateMetadata(id, organizationId, data, actorUserId, reqMeta = {}) {
    const doc = await this.getDocumentById(id, organizationId);

    const updated = await documentRepository.updateMetadata(id, organizationId, data);

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.DOCUMENT_UPDATED,
      resourceType: 'document',
      resourceId: id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { organizationId, documentId: id, previous: doc, updated: data },
    });

    return updated;
  }

  /**
   * Upload a new version for an existing document
   */
  async uploadNewVersion(id, organizationId, uploadedBy, file, reqMeta = {}) {
    const doc = await this.getDocumentById(id, organizationId);

    if (!file || !file.buffer) {
      throw AppError.badRequest('No file payload provided for version upload', 'FILE_REQUIRED');
    }

    const storageResult = await storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      organizationId
    );

    const versionId = uuidv4();

    return db.transaction(async (conn) => {
      // 1. Get next version number with lock
      const nextVersion = await documentVersionRepository.getNextVersionNumber(id, conn);

      // 2. Create immutable historical version record
      await documentVersionRepository.create(
        {
          id: versionId,
          documentId: id,
          versionNumber: nextVersion,
          storageKey: storageResult.storageKey,
          originalFilename: file.originalname,
          mimeType: storageResult.mimeType,
          fileSize: storageResult.fileSize,
          checksum: storageResult.checksum,
          uploadedBy,
        },
        conn
      );

      // 3. Update document header
      const updatedDoc = await documentRepository.updateMetadata(
        id,
        organizationId,
        {
          currentVersion: nextVersion,
          storageKey: storageResult.storageKey,
          fileSize: storageResult.fileSize,
          mimeType: storageResult.mimeType,
          originalFilename: file.originalname,
        },
        conn
      );

      // 4. Audit log
      await auditService.log(
        {
          actorUserId: uploadedBy,
          action: AUDIT_ACTIONS.DOCUMENT_VERSION_CREATED,
          resourceType: 'document',
          resourceId: id,
          ipAddress: reqMeta.ip,
          userAgent: reqMeta.userAgent,
          metadata: {
            organizationId,
            documentId: id,
            newVersion: nextVersion,
            fileSize: storageResult.fileSize,
            checksum: storageResult.checksum,
          },
        },
        conn
      );

      return updatedDoc;
    });
  }

  async listVersions(id, organizationId) {
    await this.getDocumentById(id, organizationId);
    return documentVersionRepository.listByDocument(id);
  }

  /**
   * Secure streaming download for document (current or specific version)
   */
  async getDownloadStream(id, organizationId, versionNumber = null, actorUserId = null, reqMeta = {}) {
    const doc = await this.getDocumentById(id, organizationId);

    let version;
    if (versionNumber) {
      version = await documentVersionRepository.findByVersionNumber(id, versionNumber);
      if (!version) {
        throw AppError.notFound(`Document version ${versionNumber} not found`, 'VERSION_NOT_FOUND');
      }
    } else {
      version = await documentVersionRepository.findByVersionNumber(id, doc.current_version);
      if (!version) {
        // Fallback to document header
        version = {
          storage_key: doc.storage_key,
          original_filename: doc.original_filename,
          mime_type: doc.mime_type,
          file_size: doc.file_size,
          version_number: doc.current_version,
        };
      }
    }

    const { stream, size } = await storageService.downloadStream(version.storage_key);

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.DOCUMENT_DOWNLOADED,
      resourceType: 'document',
      resourceId: id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: {
        organizationId,
        documentId: id,
        version: version.version_number,
        filename: version.original_filename,
      },
    });

    return {
      stream,
      filename: version.original_filename,
      mimeType: version.mime_type,
      size,
    };
  }

  async deleteDocument(id, organizationId, actorUserId, reqMeta = {}) {
    const doc = await this.getDocumentById(id, organizationId);

    await documentRepository.softDelete(id, organizationId);

    await auditService.log({
      actorUserId,
      action: AUDIT_ACTIONS.DOCUMENT_DELETED,
      resourceType: 'document',
      resourceId: id,
      ipAddress: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      metadata: { organizationId, documentId: id, name: doc.name },
    });
  }
}

export const documentService = new DocumentService();
