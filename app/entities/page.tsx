'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/lib/tenant-context';
import { useAuth } from '@/lib/auth-context';
// Navigation is rendered by app/entities/layout.tsx
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Building2, Trash2, Edit, Search, Filter, Globe, Mail, Phone, LayoutGrid, List, Upload } from 'lucide-react';
import { useEntities, useCreateEntity, useUpdateEntity, useDeleteEntity } from '@/lib/hooks/use-entities';
import { useAccounts } from '@/lib/hooks/use-accounts';
import type { Entity, EntityType, EntityStatus, CreateEntityInput, UpdateEntityInput } from '@/lib/types/entity';
import { toast } from 'sonner';
import { EntityGroupedView } from '@/components/EntityGroupedView';
import { BulkImportModal } from '@/components/BulkImportModal';

export default function EntitiesPage() {
  const router = useRouter();
  const { currentTenant, userRole, loading: tenantLoading } = useTenant();
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EntityStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'grouped'>('grouped');
  const [showBulkImport, setShowBulkImport] = useState(false);

  // Use React Query hooks
  const { data: entities = [], isLoading: entitiesLoading } = useEntities(currentTenant?.id);
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts(currentTenant?.id);
  const createEntityMutation = useCreateEntity();
  const updateEntityMutation = useUpdateEntity();
  const deleteEntityMutation = useDeleteEntity();

  const loading = entitiesLoading || accountsLoading;

  // Check permissions
  const canEdit = userRole ? ['owner', 'admin'].includes(userRole) : false;

  // Filter entities based on search and status
  const filteredEntities = useMemo(() => {
    return entities.filter(entity => {
      const matchesSearch = searchQuery === '' || 
        entity.entity_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entity.entity_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entity.jurisdiction.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || entity.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [entities, searchQuery, statusFilter]);

  // Calculate entity statistics
  const entityStats = useMemo(() => {
    return filteredEntities.map(entity => {
      const entityAccounts = accounts.filter(acc => acc.entity_id === entity.entity_id);
      const totalBalance = entityAccounts.reduce((sum, acc) => {
        const balance =
          acc.current_balance ??
          acc.available_balance ??
          acc.balance ??
          0;
        return sum + balance;
      }, 0);
      const currencies = [...new Set(entityAccounts.map(acc => acc.currency || 'USD').filter(Boolean))];
      
      return {
        entity,
        account_count: entityAccounts.length,
        total_balance: totalBalance,
        currencies: currencies.length > 0 ? currencies : ['USD'],
      };
    });
  }, [filteredEntities, accounts]);

  async function handleDelete(entityId: string) {
    if (!currentTenant) return;
    
    const entityName = entities.find(e => e.entity_id === entityId)?.entity_name;
    if (!confirm(`Are you sure you want to delete "${entityName}"? This action cannot be undone.`)) {
      return;
    }

    deleteEntityMutation.mutate({
      entityId,
      tenantId: currentTenant.id,
    });
  }

  if (tenantLoading) {
    return (
      <Card className="p-12 text-center max-w-2xl mx-auto mt-12">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-muted-foreground mt-4">Loading organization...</p>
      </Card>
    );
  }

  if (!currentTenant) {
    return (
      <Card className="p-12 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">No Organization Selected</h2>
        <p className="text-muted-foreground">
          Please select an organization from the sidebar.
        </p>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Entities</h1>
          <p className="text-muted-foreground mt-2">
            Manage legal entities, subsidiaries, and organizational structures
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          {!loading && entities.length > 0 && (
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
              <Button
                variant={viewMode === 'grouped' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grouped')}
                className="gap-2"
              >
                <List className="h-4 w-4" />
                Grouped
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="gap-2"
              >
                <LayoutGrid className="h-4 w-4" />
                Grid
              </Button>
            </div>
          )}
          {canEdit && (
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Entity
            </Button>
          )}
          {canEdit && (
            <Button
              onClick={() => setShowBulkImport(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Bulk Import
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      {!loading && entities.length > 0 && (
        <div className="flex gap-4 mb-6">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search entities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as EntityStatus | 'all')}
                  className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Dissolved">Dissolved</option>
                </select>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredEntities.length === 0 ? (
            <Card className="p-12 text-center">
              <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-2">
                {entities.length === 0 ? 'No Entities Yet' : 'No Matching Entities'}
              </h2>
              <p className="text-muted-foreground mb-6">
                {entities.length === 0
                  ? 'Create your first legal entity to organize your accounts'
                  : 'Try adjusting your search or filters'}
              </p>
              {canEdit && entities.length === 0 && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Entity
                </Button>
              )}
            </Card>
          ) : viewMode === 'grouped' ? (
            /* Grouped View - DEFAULT */
            <EntityGroupedView
              entities={filteredEntities}
              accounts={accounts}
              onEntityClick={(entityId) => router.push(`/entities/${entityId}`)}
              onAccountClick={(accountId) => router.push(`/accounts/${accountId}`)}
            />
          ) : (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {entityStats.map(({ entity, account_count, total_balance, currencies }) => (
                <Card 
                  key={entity.entity_id} 
                  className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push(`/entities/${entity.entity_id}`)}
                >
                  {/* Entity Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Building2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{entity.entity_name}</h3>
                        <p className="text-sm text-muted-foreground">{entity.entity_id}</p>
                      </div>
                    </div>
                    <Badge 
                      variant={entity.status === 'Active' ? 'default' : 'secondary'}
                      className={
                        entity.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : entity.status === 'Inactive'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-red-100 text-red-800'
                      }
                    >
                      {entity.status}
                    </Badge>
                  </div>

                  {/* Entity Details */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-medium">{entity.type}</span>
                      <span>•</span>
                      <Globe className="h-3 w-3" />
                      <span>{entity.jurisdiction}</span>
                    </div>
                    
                    {entity.contact_email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{entity.contact_email}</span>
                      </div>
                    )}
                    
                    {entity.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span>{entity.phone}</span>
                      </div>
                    )}

                    {entity.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                        {entity.description}
                      </p>
                    )}
                  </div>

                  {/* Statistics */}
                  <div className="border-t pt-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Accounts</p>
                        <p className="text-2xl font-bold">{account_count}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
                        <p className="text-2xl font-bold">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: currencies[0] || 'USD',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          }).format(total_balance)}
                        </p>
                        {currencies.length > 1 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            +{currencies.length - 1} more {currencies.length - 1 === 1 ? 'currency' : 'currencies'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <div className="flex gap-2 mt-4 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingEntity(entity)}
                        className="flex-1"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(entity.entity_id)}
                        disabled={deleteEntityMutation.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

      {/* Create/Edit Entity Modal */}
      {(showCreateModal || editingEntity) && canEdit && (
        <EntityModal
          entity={editingEntity}
          tenantId={currentTenant.id}
          onClose={() => {
            setShowCreateModal(false);
            setEditingEntity(null);
          }}
          onCreate={(entity) => createEntityMutation.mutate(entity)}
          onUpdate={(entityId, updates) => updateEntityMutation.mutate({ entityId, tenantId: currentTenant.id, updates })}
          isCreating={createEntityMutation.isPending}
          isUpdating={updateEntityMutation.isPending}
        />
      )}
    </div>
  );
}

// Entity Modal Component
interface EntityModalProps {
  entity: Entity | null;
  tenantId: string;
  onClose: () => void;
  onCreate: (entity: CreateEntityInput) => void;
  onUpdate: (entityId: string, updates: UpdateEntityInput) => void;
  isCreating: boolean;
  isUpdating: boolean;
}

function EntityModal({ entity, tenantId, onClose, onCreate, onUpdate, isCreating, isUpdating }: EntityModalProps) {
  const [formData, setFormData] = useState({
    entity_id: entity?.entity_id || '',
    entity_name: entity?.entity_name || '',
    type: (entity?.type || 'Corporation') as EntityType,
    jurisdiction: entity?.jurisdiction || '',
    tax_id: entity?.tax_id || '',
    contact_email: entity?.contact_email || '',
    description: entity?.description || '',
    address: entity?.address || '',
    phone: entity?.phone || '',
    website: entity?.website || '',
    status: (entity?.status || 'Active') as EntityStatus,
  });

  const isEditing = !!entity;
  const isPending = isCreating || isUpdating;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (isEditing) {
      onUpdate(entity.entity_id, {
        entity_name: formData.entity_name,
        type: formData.type,
        jurisdiction: formData.jurisdiction,
        tax_id: formData.tax_id || undefined,
        contact_email: formData.contact_email || undefined,
        description: formData.description || undefined,
        address: formData.address || undefined,
        phone: formData.phone || undefined,
        website: formData.website || undefined,
        status: formData.status,
      });
    } else {
      onCreate({
        entity_id: formData.entity_id.toUpperCase().replace(/\s+/g, '-'),
        entity_name: formData.entity_name,
        type: formData.type,
        jurisdiction: formData.jurisdiction,
        tax_id: formData.tax_id || undefined,
        contact_email: formData.contact_email || undefined,
        description: formData.description || undefined,
        address: formData.address || undefined,
        phone: formData.phone || undefined,
        website: formData.website || undefined,
        tenant_id: tenantId,
      });
    }
  }

  const entityTypes: EntityType[] = ['Corporation', 'LLC', 'Partnership', 'Sole Proprietorship', 'Trust', 'Non-Profit', 'Government', 'Other'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6">
          <h2 className="text-2xl font-bold mb-6">
            {isEditing ? 'Edit Entity' : 'Create New Entity'}
          </h2>

          <div className="space-y-4">
            {/* Entity ID - only editable when creating */}
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Entity ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.entity_id}
                  onChange={(e) => setFormData({ ...formData, entity_id: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., ACME-US, SUB-001"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Unique identifier (will be converted to uppercase, spaces to dashes)
                </p>
              </div>
            )}

            {/* Entity Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Entity Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.entity_name}
                onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Acme Corporation USA"
              />
            </div>

            {/* Entity Type */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as EntityType })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {entityTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Jurisdiction */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Jurisdiction <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.jurisdiction}
                onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Delaware, United Kingdom, Singapore"
              />
            </div>

            {/* Tax ID */}
            <div>
              <label className="block text-sm font-medium mb-2">Tax ID / EIN</label>
              <input
                type="text"
                value={formData.tax_id}
                onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 12-3456789"
              />
            </div>

            {/* Contact Email */}
            <div>
              <label className="block text-sm font-medium mb-2">Contact Email</label>
              <input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="finance@company.com"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium mb-2">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+1 (555) 123-4567"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium mb-2">Address</label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Street address, city, state, ZIP"
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-sm font-medium mb-2">Website</label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://company.com"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Brief description of the entity's purpose or operations"
              />
            </div>

            {/* Status - only for editing */}
            {isEditing && (
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as EntityStatus })}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Dissolved">Dissolved</option>
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1"
            >
              {isPending ? 'Saving...' : isEditing ? 'Update Entity' : 'Create Entity'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
