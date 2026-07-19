import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DragIndicator } from '@mui/icons-material'
import {
  Alert,
  Box,
  Chip,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog } from '@/components/base'
import type { AggregateMode } from '@/utils/aggregate-profiles'

export interface AggregateDialogItem {
  uid: string
  name: string
}

interface Props {
  open: boolean
  items: AggregateDialogItem[]
  loading?: boolean
  onCancel: () => void
  onConfirm: (mode: AggregateMode, orderedUids: string[]) => void
}

interface SortableRowProps {
  item: AggregateDialogItem
  index: number
  total: number
  entryLabel: string
  exitLabel: string
  hopLabel: string
}

const SortableRow = ({
  item,
  index,
  total,
  entryLabel,
  exitLabel,
  hopLabel,
}: SortableRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.uid })

  const isFirst = index === 0
  const isLast = index === total - 1
  const roleLabel = isFirst ? entryLabel : isLast ? exitLabel : hopLabel

  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.75,
        mb: 0.75,
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        sx={{
          display: 'flex',
          color: 'text.secondary',
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicator fontSize="small" />
      </Box>
      <Chip
        size="small"
        label={roleLabel}
        color={isFirst ? 'success' : isLast ? 'warning' : 'default'}
        variant={isFirst || isLast ? 'filled' : 'outlined'}
      />
      <Typography variant="body2" noWrap sx={{ flex: 1 }}>
        {item.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        #{index + 1}
      </Typography>
    </Box>
  )
}

export const ProfileAggregateDialog = ({
  open,
  items,
  loading = false,
  onCancel,
  onConfirm,
}: Props) => {
  const { t } = useTranslation()
  // Parent remounts this dialog on each open so mode/order start fresh from props.
  const [mode, setMode] = useState<AggregateMode>('pool')
  const [ordered, setOrdered] = useState<AggregateDialogItem[]>(items)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrdered((prev) => {
      const oldIndex = prev.findIndex((item) => item.uid === active.id)
      const newIndex = prev.findIndex((item) => item.uid === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  return (
    <BaseDialog
      open={open}
      title={t('profiles.page.aggregate.dialog.title')}
      contentSx={{ width: 460, maxWidth: '100%' }}
      okBtn={t('shared.actions.confirm')}
      cancelBtn={t('shared.actions.cancel')}
      loading={loading}
      disableOk={ordered.length === 0 || loading}
      onClose={onCancel}
      onCancel={onCancel}
      onOk={() =>
        onConfirm(
          mode,
          ordered.map((item) => item.uid),
        )
      }
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t('profiles.page.aggregate.dialog.description')}
      </Typography>

      <RadioGroup
        value={mode}
        onChange={(event) => setMode(event.target.value as AggregateMode)}
        sx={{ mb: 1.5 }}
      >
        <FormControlLabel
          value="pool"
          control={<Radio size="small" />}
          label={t('profiles.page.aggregate.dialog.modePool')}
        />
        <FormControlLabel
          value="chain"
          control={<Radio size="small" />}
          label={t('profiles.page.aggregate.dialog.modeChain')}
        />
      </RadioGroup>

      {mode === 'chain' && (
        <>
          <Alert severity="info" sx={{ mb: 1.5 }}>
            {t('profiles.page.aggregate.dialog.chainHint')}
          </Alert>
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {t('profiles.page.aggregate.dialog.chainUdpWarning')}
          </Alert>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('profiles.page.aggregate.dialog.chainOrder')}
          </Typography>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={ordered.map((item) => item.uid)}
              strategy={verticalListSortingStrategy}
            >
              {ordered.map((item, index) => (
                <SortableRow
                  key={item.uid}
                  item={item}
                  index={index}
                  total={ordered.length}
                  entryLabel={t('profiles.page.aggregate.dialog.entryHop')}
                  exitLabel={t('profiles.page.aggregate.dialog.exitHop')}
                  hopLabel={t('profiles.page.aggregate.dialog.middleHop')}
                />
              ))}
            </SortableContext>
          </DndContext>
        </>
      )}

      {mode === 'pool' && (
        <Typography variant="body2" color="text.secondary">
          {t('profiles.page.aggregate.dialog.poolHint', {
            count: ordered.length,
          })}
        </Typography>
      )}
    </BaseDialog>
  )
}
