import React, { useState, useMemo, useEffect, useRef } from 'react';
import { compareClasses } from '../../../utils/tableValidation';
import {
  X,
  SlidersHorizontal,
  ArrowUpDown,
  Layers,
  Grid,
  Search,
  Check,
  RotateCcw,
  Image as ImageIcon,
  BookOpen,
  GitBranch,
  Clock,
  Snowflake,
} from 'lucide-react';
import { MovementFilterPanel } from './DateTimeRangePicker';
import { FreezeTablePanel } from './FreezeTableModal';

export default function TableFilterModal({
  isOpen,
  onClose,
  sort = 'sr-asc',
  onSortChange,
  // Class options & selections (School)
  classOptions = [],
  selectedClasses = [],
  onClassesChange,
  // Section options & selections (School)
  sectionOptions = [],
  selectedSections = [],
  onSectionsChange,
  // Course options & selections (College)
  courseOptions = [],
  selectedCourses = [],
  onCoursesChange,
  // Branch options & selections (College)
  branchOptions = [],
  selectedBranches = [],
  onBranchesChange,
  // College-specific
  isCollege = false,
  courseLabel = 'Course',
  branchLabel = 'Branch',
  // Image / Photo filter (merged from Image Sort)
  imageColumns = [],
  activeImageSort = null,
  onImageSortChange,
  // Reset
  onResetAll,
  // Interconnected maps & counts
  classToSections = {},
  sectionToClasses = {},
  classSectionCounts = {},
  sectionClassCounts = {},
  courseToBranches = {},
  branchToCourses = {},
  courseBranchCounts = {},
  branchCourseCounts = {},
  totalCards = 0,
  photoCounts = { complete: 0, pending: 0, incomplete: 0 },
  cards = [],
  initialTab = 'sort',
  // Movement Filter Props
  showMovementTab = false,
  fromDate = '',
  toDate = '',
  onApplyMovement,
  onClearMovement,
  bulkMovePresets = [],
  // Freeze Table Props
  showFreezeTab = false,
  tableFreezeInfo = null,
  onFreezeApplied,
  onUnfrozen,
  tableId = null,
  status = 'approved',
  statusLabel = 'Approved',
  addToast,
}) {
  const hasClasses = classOptions && classOptions.length > 0;
  const hasSections = sectionOptions && sectionOptions.length > 0;
  const hasCourses = courseOptions && courseOptions.length > 0;
  const hasBranches = branchOptions && branchOptions.length > 0;

  const showClassTab = hasClasses || (!isCollege && !hasCourses && !hasBranches);
  const showSectionTab = hasSections || (!isCollege && !hasCourses && !hasBranches);
  const showCourseTab = hasCourses || (isCollege && !hasClasses);
  const showBranchTab = hasBranches || (isCollege && !hasSections);

  const tabs = useMemo(() => {
    const list = [
      {
        id: 'sort',
        label: 'Sort',
        icon: ArrowUpDown,
        hasDot: sort !== 'sr-asc',
        count: totalCards > 0 ? totalCards : undefined,
      },
      {
        id: 'photo',
        label: 'Photo',
        icon: ImageIcon,
        hasDot: Boolean(activeImageSort?.conditions?.length),
        count: activeImageSort?.conditions?.[0] ? (photoCounts[activeImageSort.conditions[0]] ?? totalCards) : (totalCards > 0 ? totalCards : undefined),
      },
    ];

    if (!isCollege) {
      if (showClassTab || showSectionTab) {
        list.push({
          id: 'class_section',
          label: 'Class & Section',
          icon: Layers,
          count: selectedClasses.length + selectedSections.length,
        });
      }
    } else {
      if (showCourseTab || showBranchTab) {
        list.push({
          id: 'class_section',
          label: `${courseLabel || 'Course'} & ${branchLabel || 'Branch'}`,
          icon: Layers,
          count: selectedCourses.length + selectedBranches.length,
        });
      }
    }
    if (showMovementTab) {
      const isMovementActive = Boolean(fromDate || toDate);
      list.push({
        id: 'movement',
        label: 'Movement',
        icon: Clock,
        hasDot: isMovementActive,
        count: isMovementActive ? totalCards : undefined,
      });
    }

    if (showFreezeTab) {
      const isFrozen = Boolean(tableFreezeInfo?.is_frozen);
      list.push({
        id: 'freeze',
        label: isFrozen ? 'Frozen' : 'Freeze',
        icon: Snowflake,
        hasDot: isFrozen,
        count: tableFreezeInfo?.cards_in_freeze !== undefined ? tableFreezeInfo.cards_in_freeze : undefined,
      });
    }

    return list;
  }, [
    isCollege,
    showClassTab,
    showSectionTab,
    showCourseTab,
    showBranchTab,
    sort,
    activeImageSort,
    selectedClasses.length,
    selectedSections.length,
    selectedCourses.length,
    selectedBranches.length,
    courseLabel,
    branchLabel,
    totalCards,
    photoCounts,
    showMovementTab,
    fromDate,
    toDate,
    showFreezeTab,
    tableFreezeInfo?.is_frozen,
    tableFreezeInfo?.cards_in_freeze,
  ]);

  const [activeTab, setActiveTab] = useState(initialTab || 'sort');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [classSearch, setClassSearch] = useState('');
  const [sectionSearch, setSectionSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');

  // Validate active tab exists in tabs
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  // Interconnected dynamic Section options based on selectedClasses
  const interconnectedSectionOptions = useMemo(() => {
    if (!selectedClasses || selectedClasses.length === 0) {
      return sectionOptions;
    }
    const hasCounts = Object.keys(classSectionCounts || {}).length > 0;
    const hasMapping = Object.keys(classToSections || {}).length > 0;

    return sectionOptions
      .map((sec) => {
        let count = 0;
        let isPresent = false;
        selectedClasses.forEach((cls) => {
          if (classSectionCounts?.[cls]?.[sec.value] !== undefined) {
            count += Number(classSectionCounts[cls][sec.value]) || 0;
            isPresent = true;
          }
          if (classToSections?.[cls]?.includes?.(sec.value)) {
            isPresent = true;
          }
        });
        return {
          ...sec,
          count: hasCounts ? count : sec.count,
          _isVisible:
            selectedSections.includes(sec.value) ||
            (hasCounts ? count > 0 : hasMapping ? isPresent : true),
        };
      })
      .filter((sec) => sec._isVisible);
  }, [sectionOptions, selectedClasses, selectedSections, classSectionCounts, classToSections]);

  // Interconnected dynamic Class options based on selectedSections
  const interconnectedClassOptions = useMemo(() => {
    let opts = classOptions;
    if (selectedSections && selectedSections.length > 0) {
      const hasCounts = Object.keys(sectionClassCounts || {}).length > 0;
      const hasMapping = Object.keys(sectionToClasses || {}).length > 0;

      opts = classOptions
        .map((cls) => {
          let count = 0;
          let isPresent = false;
          selectedSections.forEach((sec) => {
            if (sectionClassCounts?.[sec]?.[cls.value] !== undefined) {
              count += Number(sectionClassCounts[sec][cls.value]) || 0;
              isPresent = true;
            } else if (sectionClassCounts?.[sec]?.[cls.label] !== undefined) {
              count += Number(sectionClassCounts[sec][cls.label]) || 0;
              isPresent = true;
            }
            if (sectionToClasses?.[sec]?.includes?.(cls.value) || sectionToClasses?.[sec]?.includes?.(cls.label)) {
              isPresent = true;
            }
          });
          return {
            ...cls,
            count: hasCounts ? count : cls.count,
            _isVisible:
              selectedClasses.includes(cls.value) ||
              (hasCounts ? count > 0 : hasMapping ? isPresent : true),
          };
        })
        .filter((cls) => cls._isVisible);
    }
    return [...opts].sort(compareClasses);
  }, [classOptions, selectedSections, selectedClasses, sectionClassCounts, sectionToClasses]);

  // Interconnected dynamic Branch options based on selectedCourses (College)
  const interconnectedBranchOptions = useMemo(() => {
    if (!selectedCourses || selectedCourses.length === 0) {
      return branchOptions;
    }
    const hasCounts = Object.keys(courseBranchCounts || {}).length > 0;
    return branchOptions
      .map((br) => {
        let count = 0;
        let isPresent = false;
        selectedCourses.forEach((cr) => {
          if (courseBranchCounts?.[cr]?.[br.value] !== undefined) {
            count += Number(courseBranchCounts[cr][br.value]) || 0;
            isPresent = true;
          }
          if (courseToBranches?.[cr]?.includes?.(br.value)) {
            isPresent = true;
          }
        });
        return {
          ...br,
          count: hasCounts ? count : br.count,
          _isVisible:
            selectedBranches.includes(br.value) ||
            (hasCounts ? count > 0 : isPresent),
        };
      })
      .filter((br) => br._isVisible);
  }, [branchOptions, selectedCourses, selectedBranches, courseBranchCounts, courseToBranches]);

  // Interconnected dynamic Course options based on selectedBranches (College)
  const interconnectedCourseOptions = useMemo(() => {
    if (!selectedBranches || selectedBranches.length === 0) {
      return courseOptions;
    }
    const hasCounts = Object.keys(branchCourseCounts || {}).length > 0;
    return courseOptions
      .map((cr) => {
        let count = 0;
        let isPresent = false;
        selectedBranches.forEach((br) => {
          if (branchCourseCounts?.[br]?.[cr.value] !== undefined) {
            count += Number(branchCourseCounts[br][cr.value]) || 0;
            isPresent = true;
          }
          if (branchToCourses?.[br]?.includes?.(cr.value)) {
            isPresent = true;
          }
        });
        return {
          ...cr,
          count: hasCounts ? count : cr.count,
          _isVisible:
            selectedCourses.includes(cr.value) ||
            (hasCounts ? count > 0 : isPresent),
        };
      })
      .filter((cr) => cr._isVisible);
  }, [courseOptions, selectedBranches, selectedCourses, branchCourseCounts, branchToCourses]);

  // Filtered lists based on search
  const filteredClassOptions = useMemo(() => {
    if (!classSearch.trim()) return interconnectedClassOptions;
    const q = classSearch.toLowerCase().trim();
    return interconnectedClassOptions.filter((opt) =>
      (opt.label || opt.value || '').toLowerCase().includes(q)
    );
  }, [interconnectedClassOptions, classSearch]);

  const filteredSectionOptions = useMemo(() => {
    if (!sectionSearch.trim()) return interconnectedSectionOptions;
    const q = sectionSearch.toLowerCase().trim();
    return interconnectedSectionOptions.filter((opt) =>
      (opt.label || opt.value || '').toLowerCase().includes(q)
    );
  }, [interconnectedSectionOptions, sectionSearch]);

  const filteredCourseOptions = useMemo(() => {
    if (!courseSearch.trim()) return interconnectedCourseOptions;
    const q = courseSearch.toLowerCase().trim();
    return interconnectedCourseOptions.filter((opt) =>
      (opt.label || opt.value || '').toLowerCase().includes(q)
    );
  }, [interconnectedCourseOptions, courseSearch]);

  const filteredBranchOptions = useMemo(() => {
    if (!branchSearch.trim()) return interconnectedBranchOptions;
    const q = branchSearch.toLowerCase().trim();
    return interconnectedBranchOptions.filter((opt) =>
      (opt.label || opt.value || '').toLowerCase().includes(q)
    );
  }, [interconnectedBranchOptions, branchSearch]);

  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (e.target.closest('#table-filter-toggle-btn') || e.target.closest('.table-filter-toggle-btn')) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen, onClose]);

  const namedCardsCount = useMemo(() => {
    if (!cards || cards.length === 0) return totalCards;
    return cards.filter((c) => {
      const data = c?.field_data || c?.data || c || {};
      const val = data.NAME || data.name || data.STUDENT_NAME || data.student_name || '';
      return String(val).trim().length > 0;
    }).length;
  }, [cards, totalCards]);

  if (!isOpen) return null;

  // Toggle handlers
  const handleToggleClass = (val) => {
    if (!onClassesChange) return;
    const exists = selectedClasses.includes(val);
    onClassesChange(exists ? selectedClasses.filter((c) => c !== val) : [...selectedClasses, val]);
  };
  const handleSelectAllClasses = () => {
    if (!onClassesChange) return;
    onClassesChange(filteredClassOptions.map((o) => o.value));
  };
  const handleClearClasses = () => {
    if (!onClassesChange) return;
    onClassesChange([]);
  };

  const handleToggleSection = (val) => {
    if (!onSectionsChange) return;
    const exists = selectedSections.includes(val);
    onSectionsChange(exists ? selectedSections.filter((s) => s !== val) : [...selectedSections, val]);
  };
  const handleSelectAllSections = () => {
    if (!onSectionsChange) return;
    onSectionsChange(filteredSectionOptions.map((o) => o.value));
  };
  const handleClearSections = () => {
    if (!onSectionsChange) return;
    onSectionsChange([]);
  };

  const handleToggleCourse = (val) => {
    if (!onCoursesChange) return;
    const exists = selectedCourses.includes(val);
    onCoursesChange(exists ? selectedCourses.filter((c) => c !== val) : [...selectedCourses, val]);
  };
  const handleSelectAllCourses = () => {
    if (!onCoursesChange) return;
    onCoursesChange(filteredCourseOptions.map((o) => o.value));
  };
  const handleClearCourses = () => {
    if (!onCoursesChange) return;
    onCoursesChange([]);
  };

  const handleToggleBranch = (val) => {
    if (!onBranchesChange) return;
    const exists = selectedBranches.includes(val);
    onBranchesChange(exists ? selectedBranches.filter((c) => c !== val) : [...selectedBranches, val]);
  };
  const handleSelectAllBranches = () => {
    if (!onBranchesChange) return;
    onBranchesChange(filteredBranchOptions.map((o) => o.value));
  };
  const handleClearBranches = () => {
    if (!onBranchesChange) return;
    onBranchesChange([]);
  };

  // Image Sort helpers
  const handleSetImageSortCondition = (colName, cond) => {
    if (!onImageSortChange) return;
    if (!cond) {
      onImageSortChange(null);
    } else {
      onImageSortChange({
        columns: [colName || (imageColumns[0] && imageColumns[0].name) || 'PHOTO'],
        conditions: [cond],
      });
    }
  };

  const sortOptions = [
    { value: 'sr-asc', label: 'Newest First (Default)', desc: 'Order by original upload sequence', count: totalCards },
    { value: 'sr-desc', label: 'Oldest First', desc: 'Reverse upload sequence', count: totalCards },
    { value: 'name-asc', label: 'Name (A to Z)', desc: 'Alphabetical ascending by student name', count: namedCardsCount },
    { value: 'name-desc', label: 'Name (Z to A)', desc: 'Alphabetical descending by student name', count: namedCardsCount },
  ];

  const totalActiveFilters =
    selectedClasses.length +
    selectedSections.length +
    selectedCourses.length +
    selectedBranches.length +
    (sort && sort !== 'sr-asc' ? 1 : 0) +
    (activeImageSort?.conditions?.length ? 1 : 0) +
    (showMovementTab && (fromDate || toDate) ? 1 : 0) +
    (showFreezeTab && tableFreezeInfo?.is_frozen ? 1 : 0);

  // Helper to render checkbox list tab
  const renderCheckboxTab = ({
    searchVal,
    onSearchChange,
    placeholder,
    options,
    selectedList,
    onToggle,
    onSelectAll,
    onClear,
    emptyText,
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Search & Actions Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              fontSize: '14px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchVal && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 0,
              }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onSelectAll}
            style={{
              padding: '6px 10px',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: '6px 10px',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#ef4444',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Checkbox Options List */}
      <div
        style={{
          maxHeight: '320px',
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {options.length === 0 ? (
          <div
            style={{
              padding: '30px 16px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '14px',
            }}
          >
            {emptyText}
          </div>
        ) : (
          options.map((opt) => {
            const isChecked = selectedList.includes(opt.value);
            return (
              <div
                key={opt.value}
                onClick={() => onToggle(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: isChecked ? '#eff6ff' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isChecked) e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isChecked) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      border: isChecked ? '1px solid #2563eb' : '1px solid #cbd5e1',
                      backgroundColor: isChecked ? '#2563eb' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      flexShrink: 0,
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {isChecked && <Check size={12} strokeWidth={3} />}
                  </div>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: isChecked ? 600 : 500,
                      color: isChecked ? '#1d4ed8' : '#1e293b',
                    }}
                  >
                    {opt.label || opt.value}
                  </span>
                </div>

                {/* Count Pill */}
                {typeof opt.count === 'number' && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: isChecked ? '#dbeafe' : '#f1f5f9',
                      color: isChecked ? '#1e40af' : '#64748b',
                      flexShrink: 0,
                    }}
                  >
                    {opt.count} {opt.count === 1 ? 'card' : 'cards'}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        right: 0,
        zIndex: 9999,
        width: (activeTab === 'class_section' || activeTab === 'movement' || activeTab === 'freeze') ? '680px' : '620px',
        maxWidth: '92vw',
        maxHeight: '80vh',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.18), 0 6px 12px -4px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
        animation: 'fadeIn 0.12s ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
    >
        {/* Sleek Header */}
        <div
          style={{
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SlidersHorizontal size={17} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                Filter & Sort Options
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Refine displayed cards by display order, group selections, or photo status
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            padding: '0 16px',
            gap: '6px',
            overflowX: 'hidden',
          }}
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '12px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  color: isActive ? '#2563eb' : '#64748b',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={14} />
                <span>{t.label}</span>
                {t.hasDot && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#2563eb',
                      display: 'inline-block',
                    }}
                  />
                )}

              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          {/* TAB 1: SORT */}
          {activeTab === 'sort' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: '#64748b',
                      letterSpacing: '0.05em',
                      margin: 0,
                    }}
                  >
                    Card Display Order
                  </label>
                  <button
                    type="button"
                    onClick={() => onSortChange && onSortChange('sr-asc')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                    title="Reset to default sort (Upload Order)"
                  >
                    Clear
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {sortOptions.map((opt) => {
                    const isSelected = sort === opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => onSortChange && onSortChange(opt.value)}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = '#f8fafc';
                            e.currentTarget.style.borderColor = '#cbd5e1';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.backgroundColor = '#ffffff';
                            e.currentTarget.style.borderColor = '#e2e8f0';
                          }
                        }}
                        style={{
                          padding: '14px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                        }}
                      >
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: isSelected ? '5px solid #2563eb' : '2px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            marginTop: '2px',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: 600,
                                color: isSelected ? '#1d4ed8' : '#1e293b',
                              }}
                            >
                              {opt.label}
                            </span>
                            {typeof opt.count === 'number' && opt.count >= 0 && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  background: isSelected ? '#dbeafe' : '#f1f5f9',
                                  color: isSelected ? '#1d4ed8' : '#64748b',
                                  border: isSelected ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                }}
                              >
                                {Number(opt.count).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px', lineHeight: 1.4 }}>
                            {opt.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PHOTO */}
          {activeTab === 'photo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: '#64748b',
                      letterSpacing: '0.05em',
                      margin: 0,
                    }}
                  >
                    <ImageIcon size={13} style={{ color: '#3b82f6' }} />
                    <span>Filter By Photo Status</span>
                  </label>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    Quickly filter cards based on student photograph completion status.
                  </p>
                </div>
                {activeImageSort?.conditions?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSetImageSortCondition(null, null)}
                    style={{
                      background: '#fee2e2',
                      border: '1px solid #fca5a5',
                      color: '#dc2626',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Clear Photo Filter
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '6px' }}>
                {[
                  {
                    cond: 'complete',
                    label: 'Complete',
                    sub: 'With Photo',
                    desc: 'Cards with valid photos',
                    color: '#10b981',
                    bg: '#ecfdf5',
                    count: photoCounts?.complete ?? 0,
                  },
                  {
                    cond: 'pending',
                    label: 'Pending',
                    sub: 'Missing Photo',
                    desc: 'Assigned but file pending',
                    color: '#f59e0b',
                    bg: '#fffbeb',
                    count: photoCounts?.pending ?? 0,
                  },
                  {
                    cond: 'incomplete',
                    label: 'Incomplete',
                    sub: 'Needs Attention',
                    desc: 'No photo assigned',
                    color: '#ef4444',
                    bg: '#fef2f2',
                    count: photoCounts?.incomplete ?? 0,
                  },
                ].map((item) => {
                  const isSelected = activeImageSort?.conditions?.includes(item.cond);
                  const targetCol = (imageColumns[0] && imageColumns[0].name) || 'PHOTO';
                  return (
                    <div
                      key={item.cond}
                      onClick={() =>
                        handleSetImageSortCondition(
                          targetCol,
                          isSelected ? null : item.cond
                        )
                      }
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = '#f8fafc';
                          e.currentTarget.style.borderColor = '#cbd5e1';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = '#ffffff';
                          e.currentTarget.style.borderColor = '#e2e8f0';
                        }
                      }}
                      style={{
                        padding: '16px 12px',
                        borderRadius: '8px',
                        border: isSelected ? `2px solid ${item.color}` : '1px solid #e2e8f0',
                        backgroundColor: isSelected ? item.bg : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '0 2px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: isSelected ? item.color : '#334155',
                          }}
                        >
                          {item.label}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: isSelected ? item.color : '#f1f5f9',
                            color: isSelected ? '#ffffff' : '#475569',
                            border: isSelected ? 'none' : '1px solid #e2e8f0',
                          }}
                        >
                          {Number(item.count ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: isSelected ? item.color : '#64748b',
                        }}
                      >
                        {item.sub}
                      </div>
                      <div
                        style={{
                          fontSize: '11.5px',
                          color: '#94a3b8',
                          marginTop: '4px',
                        }}
                      >
                        {item.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: CLASS & SECTION (COMBINED) */}
          {activeTab === 'class_section' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'stretch' }}>
              {/* Column 1: Class (or Course) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em' }}>
                      {isCollege ? (courseLabel || 'Course') : 'Class'}
                    </span>
                    {(isCollege ? selectedCourses.length : selectedClasses.length) > 0 && (
                      <span style={{ background: '#2563eb', color: '#ffffff', fontSize: '14px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px' }}>
                        {isCollege ? selectedCourses.length : selectedClasses.length}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={isCollege ? handleSelectAllCourses : handleSelectAllClasses}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '14px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
                    >
                      All
                    </button>
                    <span style={{ color: '#cbd5e1', fontSize: '14px' }}>|</span>
                    <button
                      type="button"
                      onClick={isCollege ? handleClearCourses : handleClearClasses}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '14px', fontWeight: 600, color: '#ef4444', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={13} style={{ position: 'absolute', left: '9px', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={isCollege ? courseSearch : classSearch}
                    onChange={(e) => (isCollege ? setCourseSearch(e.target.value) : setClassSearch(e.target.value))}
                    placeholder={`Search ${isCollege ? (courseLabel || 'course').toLowerCase() : 'classes'}...`}
                    style={{
                      width: '100%',
                      padding: '6px 26px 6px 28px',
                      fontSize: '13px',
                      borderRadius: '5px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {(isCollege ? courseSearch : classSearch) && (
                    <button
                      type="button"
                      onClick={() => (isCollege ? setCourseSearch('') : setClassSearch(''))}
                      style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div
                  style={{
                    maxHeight: '320px',
                    height: '320px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    backgroundColor: '#ffffff',
                  }}
                >
                  {(isCollege ? filteredCourseOptions : filteredClassOptions).length === 0 ? (
                    <div style={{ padding: '30px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      No {isCollege ? (courseLabel || 'course') : 'class'} options found
                    </div>
                  ) : (
                    (isCollege ? filteredCourseOptions : filteredClassOptions).map((opt) => {
                      const isChecked = (isCollege ? selectedCourses : selectedClasses).includes(opt.value);
                      const toggleFn = isCollege ? handleToggleCourse : handleToggleClass;
                      return (
                        <div
                          key={opt.value}
                          onClick={() => toggleFn(opt.value)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            backgroundColor: isChecked ? '#eff6ff' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                            userSelect: 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (!isChecked) e.currentTarget.style.backgroundColor = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            if (!isChecked) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: '15px',
                                height: '15px',
                                borderRadius: '3px',
                                border: isChecked ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                backgroundColor: isChecked ? '#2563eb' : '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                flexShrink: 0,
                              }}
                            >
                              {isChecked && <Check size={10} strokeWidth={3} />}
                            </div>
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: isChecked ? 600 : 500,
                                color: isChecked ? '#1d4ed8' : '#1e293b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {opt.label || opt.value}
                            </span>
                          </div>
                          {typeof opt.count === 'number' && (
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '8px',
                                backgroundColor: isChecked ? '#dbeafe' : '#f1f5f9',
                                color: isChecked ? '#1e40af' : '#64748b',
                                flexShrink: 0,
                              }}
                            >
                              {opt.count}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Column 2: Section (or Branch) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em' }}>
                      {isCollege ? (branchLabel || 'Branch') : 'Section'}
                    </span>
                    {(isCollege ? selectedBranches.length : selectedSections.length) > 0 && (
                      <span style={{ background: '#2563eb', color: '#ffffff', fontSize: '14px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px' }}>
                        {isCollege ? selectedBranches.length : selectedSections.length}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={isCollege ? handleSelectAllBranches : handleSelectAllSections}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '14px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
                    >
                      All
                    </button>
                    <span style={{ color: '#cbd5e1', fontSize: '14px' }}>|</span>
                    <button
                      type="button"
                      onClick={isCollege ? handleClearBranches : handleClearSections}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '14px', fontWeight: 600, color: '#ef4444', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={13} style={{ position: 'absolute', left: '9px', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={isCollege ? branchSearch : sectionSearch}
                    onChange={(e) => (isCollege ? setBranchSearch(e.target.value) : setSectionSearch(e.target.value))}
                    placeholder={`Search ${isCollege ? (branchLabel || 'branch').toLowerCase() : 'sections'}...`}
                    style={{
                      width: '100%',
                      padding: '6px 26px 6px 28px',
                      fontSize: '13px',
                      borderRadius: '5px',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {(isCollege ? branchSearch : sectionSearch) && (
                    <button
                      type="button"
                      onClick={() => (isCollege ? setBranchSearch('') : setSectionSearch(''))}
                      style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div
                  style={{
                    maxHeight: '320px',
                    height: '320px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    backgroundColor: '#ffffff',
                  }}
                >
                  {(isCollege ? filteredBranchOptions : filteredSectionOptions).length === 0 ? (
                    <div style={{ padding: '30px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      No {isCollege ? (branchLabel || 'branch') : 'section'} options found
                    </div>
                  ) : (
                    (isCollege ? filteredBranchOptions : filteredSectionOptions).map((opt) => {
                      const isChecked = (isCollege ? selectedBranches : selectedSections).includes(opt.value);
                      const toggleFn = isCollege ? handleToggleBranch : handleToggleSection;
                      return (
                        <div
                          key={opt.value}
                          onClick={() => toggleFn(opt.value)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            backgroundColor: isChecked ? '#eff6ff' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                            userSelect: 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (!isChecked) e.currentTarget.style.backgroundColor = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            if (!isChecked) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: '15px',
                                height: '15px',
                                borderRadius: '3px',
                                border: isChecked ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                backgroundColor: isChecked ? '#2563eb' : '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                flexShrink: 0,
                              }}
                            >
                              {isChecked && <Check size={10} strokeWidth={3} />}
                            </div>
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: isChecked ? 600 : 500,
                                color: isChecked ? '#1d4ed8' : '#1e293b',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {opt.label || opt.value}
                            </span>
                          </div>
                          {typeof opt.count === 'number' && (
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '8px',
                                backgroundColor: isChecked ? '#dbeafe' : '#f1f5f9',
                                color: isChecked ? '#1e40af' : '#64748b',
                                flexShrink: 0,
                              }}
                            >
                              {opt.count}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'movement' && (
            <MovementFilterPanel
              fromDate={fromDate}
              toDate={toDate}
              onApply={onApplyMovement}
              onClear={onClearMovement}
              totalMatched={totalCards}
              bulkMovePresets={bulkMovePresets}
            />
          )}
          {activeTab === 'freeze' && (
            <FreezeTablePanel
              tableId={tableId}
              status={status}
              statusLabel={statusLabel}
              tableFreezeInfo={tableFreezeInfo}
              onFreezeApplied={onFreezeApplied}
              onUnfrozen={onUnfrozen}
              addToast={addToast}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={() => {
              onResetAll?.();
              onClearMovement?.();
            }}
            disabled={totalActiveFilters === 0}
            onMouseEnter={(e) => {
              if (totalActiveFilters > 0) {
                e.currentTarget.style.backgroundColor = '#fef2f2';
                e.currentTarget.style.borderColor = '#fca5a5';
              }
            }}
            onMouseLeave={(e) => {
              if (totalActiveFilters > 0) {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '6px',
              border: totalActiveFilters > 0 ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              color: totalActiveFilters > 0 ? '#dc2626' : '#94a3b8',
              cursor: totalActiveFilters > 0 ? 'pointer' : 'not-allowed',
              opacity: totalActiveFilters > 0 ? 1 : 0.6,
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCcw size={13} />
            <span>Reset All</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {totalActiveFilters > 0 && (
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
                {totalActiveFilters} active filter{totalActiveFilters > 1 ? 's' : ''}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1d4ed8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }}
              style={{
                padding: '8px 18px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.15s ease',
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
  );
}
