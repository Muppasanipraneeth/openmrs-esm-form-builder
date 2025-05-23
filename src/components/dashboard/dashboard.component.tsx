import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation, type TFunction } from 'react-i18next';
import {
  Button,
  DataTable,
  DataTableSkeleton,
  Dropdown,
  IconButton,
  InlineLoading,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Tile,
} from '@carbon/react';
import { Add, DocumentImport, Download, Edit, TrashCan } from '@carbon/react/icons';
import { type KeyedMutator, preload } from 'swr';
import {
  ConfigurableLink,
  navigate,
  openmrsFetch,
  restBaseUrl,
  showModal,
  showSnackbar,
  useConfig,
  useLayoutType,
  usePagination,
} from '@openmrs/esm-framework';
import EmptyState from '../empty-state/empty-state.component';
import ErrorState from '../error-state/error-state.component';
import Header from '../header/header.component';
import { deleteForm } from '@resources/forms.resource';
import { FormBuilderPagination } from '../pagination';
import { useClobdata } from '@hooks/useClobdata';
import { useForms } from '@hooks/useForms';
import type { ConfigObject } from '../../config-schema';
import type { Form as TypedForm } from '@types';
import styles from './dashboard.scss';

type Mutator = KeyedMutator<{
  data: {
    results: Array<TypedForm>;
  };
}>;

interface ActionButtonsProps {
  form: TypedForm;
  mutate: Mutator;
  responsiveSize: string;
  t: TFunction;
}

interface FormsListProps {
  forms: Array<TypedForm>;
  isValidating: boolean;
  mutate: Mutator;
  t: TFunction;
}

function CustomTag({ condition }: { condition?: boolean }) {
  const { t } = useTranslation();

  if (condition) {
    return (
      <Tag type="green" size="md" title="Clear Filter" data-testid="yes-tag">
        {t('yes', 'Yes')}
      </Tag>
    );
  }

  return (
    <Tag type="red" size="md" title="Clear Filter" data-testid="no-tag">
      {t('no', 'No')}
    </Tag>
  );
}

function ActionButtons({ form, mutate, responsiveSize, t }: ActionButtonsProps) {
  const defaultEnterDelayInMs = 300;
  const { clobdata } = useClobdata(form);
  const formResources = form?.resources;
  const [isDeletingForm, setIsDeletingForm] = useState(false);

  const downloadableSchema = useMemo(
    () =>
      new Blob([JSON.stringify(clobdata, null, 2)], {
        type: 'application/json',
      }),
    [clobdata],
  );

  const handleDeleteForm = useCallback(
    async (formUuid: string) => {
      try {
        const res = await deleteForm(formUuid);
        if (res.status === 204) {
          showSnackbar({
            title: t('formDeleted', 'Form deleted'),
            kind: 'success',
            isLowContrast: true,
            subtitle: t('formDeletedMessage', 'The form "{{- formName}}" has been deleted successfully', {
              formName: form.name,
            }),
          });
          await mutate();
        }
      } catch (e: unknown) {
        if (e instanceof Error) {
          showSnackbar({
            title: t('errorDeletingForm', 'Error deleting form'),
            kind: 'error',
            subtitle: e?.message,
          });
        }
      } finally {
        setIsDeletingForm(false);
      }
    },
    [form.name, mutate, t],
  );

  const launchDeleteFormModal = useCallback(() => {
    const dispose = showModal('delete-form-modal', {
      closeModal: () => dispose(),
      isDeletingForm,
      onDeleteForm: () => handleDeleteForm(form.uuid),
    });
  }, [form.uuid, handleDeleteForm, isDeletingForm]);

  const ImportButton = () => {
    return (
      <IconButton
        align="center"
        enterDelayMs={defaultEnterDelayInMs}
        label={t('import', 'Import')}
        kind="ghost"
        onClick={() => navigate({ to: `${window.spaBase}/form-builder/edit/${form.uuid}` })}
        size={responsiveSize}
      >
        <DocumentImport />
      </IconButton>
    );
  };

  const EditButton = () => {
    return (
      <IconButton
        enterDelayMs={defaultEnterDelayInMs}
        kind="ghost"
        label={t('editSchema', 'Edit schema')}
        onClick={() =>
          navigate({
            to: `${window.spaBase}/form-builder/edit/${form.uuid}`,
          })
        }
        size={responsiveSize}
      >
        <Edit />
      </IconButton>
    );
  };

  const DownloadSchemaButton = () => {
    return (
      <a download={`${form?.name}.json`} href={window.URL.createObjectURL(downloadableSchema)}>
        <IconButton
          enterDelayMs={defaultEnterDelayInMs}
          kind="ghost"
          label={t('downloadSchema', 'Download schema')}
          size={responsiveSize}
        >
          <Download />
        </IconButton>
      </a>
    );
  };

  const DeleteButton = () => {
    return (
      <IconButton
        enterDelayMs={defaultEnterDelayInMs}
        kind="ghost"
        label={t('deleteSchema', 'Delete schema')}
        onClick={launchDeleteFormModal}
        size={responsiveSize}
      >
        <TrashCan />
      </IconButton>
    );
  };

  return (
    <>
      {formResources.length == 0 || !form?.resources[0] ? (
        <ImportButton />
      ) : (
        <>
          <EditButton />
          <DownloadSchemaButton />
        </>
      )}
      <DeleteButton />
    </>
  );
}

function FormsList({ forms, isValidating, mutate, t }: FormsListProps) {
  const pageSize = 10;
  const isTablet = useLayoutType() === 'tablet';
  const responsiveSize = isTablet ? 'lg' : 'sm';
  const [filter, setFilter] = useState('');
  const [searchString, setSearchString] = useState('');

  const filteredRows = useMemo(() => {
    if (!filter) {
      return forms;
    }

    if (filter === 'Published') {
      return forms.filter((form) => form.published);
    }

    if (filter === 'Unpublished') {
      return forms.filter((form) => !form.published);
    }

    if (filter === 'Retired') {
      return forms.filter((form) => form.retired);
    }

    return forms;
  }, [filter, forms]);

  const tableHeaders = [
    {
      header: t('name', 'Name'),
      key: 'name',
    },
    {
      header: t('version', 'Version'),
      key: 'version',
    },
    {
      header: t('published', 'Published'),
      key: 'published',
    },
    {
      header: t('retired', 'Retired'),
      key: 'retired',
    },
    {
      header: t('schemaActions', 'Schema actions'),
      key: 'actions',
    },
  ];

  const editSchemaUrl = '${openmrsSpaBase}/form-builder/edit/${formUuid}';

  const searchResults = useMemo(() => {
    if (searchString && searchString.trim() !== '') {
      return filteredRows.filter((form) => form.name.toLowerCase().includes(searchString.toLowerCase()));
    }

    return filteredRows;
  }, [searchString, filteredRows]);

  const { paginated, goTo, results, currentPage } = usePagination(searchResults, pageSize);

  const tableRows = results?.map((form: TypedForm) => ({
    ...form,
    id: form?.uuid,
    name: (
      <ConfigurableLink
        className={styles.link}
        to={editSchemaUrl}
        templateParams={{ formUuid: form?.uuid }}
        onMouseEnter={() => void preload(`${restBaseUrl}/form/${form?.uuid}?v=full`, openmrsFetch)}
      >
        {form.name}
      </ConfigurableLink>
    ),
    published: <CustomTag condition={form.published} />,
    retired: <CustomTag condition={form.retired} />,
    actions: <ActionButtons form={form} mutate={mutate} responsiveSize={responsiveSize} t={t} />,
  }));

  const handleFilter = ({ selectedItem }: { selectedItem: string }) => setFilter(selectedItem);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      goTo(1);
      setSearchString(e.target.value);
    },
    [goTo, setSearchString],
  );

  return (
    <>
      <div className={styles.flexContainer}>
        <div className={styles.filterContainer}>
          <Dropdown
            className={styles.filterDropdown}
            id="publishStatusFilter"
            initialSelectedItem={'All'}
            label=""
            titleText={t('filterBy', 'Filter by') + ':'}
            size={responsiveSize}
            type="inline"
            items={['All', 'Published', 'Unpublished', 'Retired']}
            onChange={handleFilter}
          />
        </div>
        <div className={styles.backgroundDataFetchingIndicator}>
          <span>{isValidating ? <InlineLoading /> : null}</span>
        </div>
      </div>
      <DataTable rows={tableRows} headers={tableHeaders} size={isTablet ? 'lg' : 'sm'} useZebraStyles>
        {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
          <>
            <TableContainer className={styles.tableContainer} data-testid="forms-table">
              <div className={styles.toolbarWrapper}>
                <TableToolbar className={styles.tableToolbar} size={responsiveSize}>
                  <TableToolbarContent className={styles.headerContainer}>
                    <TableToolbarSearch
                      expanded
                      className={styles.searchbox}
                      onChange={handleSearch}
                      placeholder={t('searchThisList', 'Search this list')}
                    />
                    <Button
                      kind="primary"
                      iconDescription={t('createNewForm', 'Create a new form')}
                      renderIcon={() => <Add size={16} />}
                      size={responsiveSize}
                      onClick={() =>
                        navigate({
                          to: `${window.spaBase}/form-builder/new`,
                        })
                      }
                    >
                      {t('createNewForm', 'Create a new form')}
                    </Button>
                  </TableToolbarContent>
                </TableToolbar>
              </div>
              <Table {...getTableProps()} className={styles.table}>
                <TableHead>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHeader {...getHeaderProps({ header })}>{header.header}</TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key="row.id" {...getRowProps({ row })} data-testid={`form-row-${row.id}`}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{cell.value}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {rows.length === 0 ? (
              <div className={styles.tileContainer}>
                <Tile className={styles.tile}>
                  <div className={styles.tileContent}>
                    <p className={styles.content}>{t('noMatchingFormsToDisplay', 'No matching forms to display')}</p>
                    <p className={styles.helper}>{t('checkFilters', 'Check the filters above')}</p>
                  </div>
                </Tile>
              </div>
            ) : null}
          </>
        )}
      </DataTable>
      {paginated && (
        <FormBuilderPagination
          currentItems={results.length}
          totalItems={searchResults.length}
          onPageNumberChange={({ page }) => {
            goTo(page);
          }}
          pageNumber={currentPage}
          pageSize={pageSize}
        />
      )}
    </>
  );
}

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { forms, error, isLoading, isValidating, mutate } = useForms();
  const { showSchemaSaveWarning } = useConfig<ConfigObject>();

  return (
    <main>
      <Header title={t('home', 'Home')} />
      <div className={styles.container}>
        {(() => {
          if (error) {
            return <ErrorState error={error} />;
          }

          if (isLoading) {
            return <DataTableSkeleton role="progressbar" />;
          }

          if (forms.length === 0) {
            return <EmptyState />;
          }

          return (
            <>
              {showSchemaSaveWarning && (
                <InlineNotification
                  className={styles.warningMessage}
                  kind="info"
                  lowContrast
                  title={t(
                    'schemaSaveWarningMessage',
                    "The dev3 server is ephemeral at best and can't be relied upon to save your schemas permanently. To avoid losing your work, please save your schemas to your local machine. Alternatively, upload your schema to the distro repo to have it persisted across server resets.",
                  )}
                />
              )}
              <FormsList forms={forms} isValidating={isValidating} mutate={mutate} t={t} />
            </>
          );
        })()}
      </div>
    </main>
  );
};

export default Dashboard;
