/** What the progress bar is showing: transfers count bytes, deletions count items. */
export type ProgressMode =
	| 'copy'
	| 'move'
	| 'compress'
	| 'extract'
	| 'send'
	| 'receive'
	| 'trash'
	| 'delete'
	| 'duplicates'
	| 'images';
