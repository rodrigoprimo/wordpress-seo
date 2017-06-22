<?php
/**
 * @package WPSEO\Admin\Links
 */

/**
 * Represents the link columns. This class will add and handle the link columns.
 */
class WPSEO_Link_Columns {

	const COLUMN_LINKED = 'linked';
	const COLUMN_LINKS  = 'links';

	/** @var WPSEO_Link_Column_Count */
	protected $count_linked;

	/** @var WPSEO_Link_Column_Count */
	protected $count_links;

	/**
	 * Registers the hooks.
	 */
	public function register_hooks() {
		global $pagenow;
		if ( $pagenow !== 'edit.php' ) {
			return;
		}

		// Hook into tablenav to calculate links and linked.
		add_action( 'manage_posts_extra_tablenav', array( $this, 'count_objects' ) );

		$post_types = get_post_types( array( 'public' => true ), 'names' );

		if ( is_array( $post_types ) && $post_types !== array() ) {
			array_walk( $post_types, array( $this, 'set_post_type_hooks' ) );
		}
	}

	/**
	 * Sets the hooks for each post type.
	 *
	 * @param string $post_type The post type.
	 */
	public function set_post_type_hooks( $post_type ) {
		add_filter( 'manage_' . $post_type . '_posts_columns', array( $this, 'add_post_columns' ) );
		add_action( 'manage_' . $post_type . '_posts_custom_column', array( $this, 'column_content' ), 10, 2 );
		add_filter( 'manage_edit-' . $post_type . '_sortable_columns', array( $this, 'column_sort' ) );
	}

	/**
	 * Adds the columns for the post overview.
	 *
	 * @param array $columns Array with columns.
	 *
	 * @return array The extended array with columns.
	 */
	public function add_post_columns( array $columns ) {
		$columns[ 'wpseo-' . self::COLUMN_LINKS ]  = __( 'Links', 'wordpress-seo' );
		$columns[ 'wpseo-' . self::COLUMN_LINKED ] = __( 'Linked', 'wordpress-seo' );

		return $columns;
	}

	/**
	 * Makes sure we calculate all values in one query.
	 *
	 * @param string $target Extra table navigation location which is triggered.
	 */
	public function count_objects( $target ) {
		if ( 'top' === $target ) {
			$this->set_count_objects();
		}
	}

	/**
	 * Sets the objects to use for the count.
	 */
	public function set_count_objects() {
		global $wp_query;

		$post_ids = array_keys( $wp_query->get_posts() );
		$post_ids = $this->filter_unprocessed_posts( $post_ids );

		$linked = new WPSEO_Link_Column_Count( 'target_post_id' );
		$linked->set( $post_ids );

		$links = new WPSEO_Link_Column_Count( 'post_id' );
		$links->set( $post_ids );

		$this->count_linked = $linked;
		$this->count_links  = $links;
	}

	/**
	 * Displays the column content for the given column
	 *
	 * @param string $column_name Column to display the content for.
	 * @param int    $post_id     Post to display the column content for.
	 */
	public function column_content( $column_name, $post_id ) {
		switch ( $column_name ) {
			case 'wpseo-' . self::COLUMN_LINKS :
				echo $this->count_links->get( $post_id );
				break;
			case 'wpseo-' . self::COLUMN_LINKED :
				echo $this->count_linked->get( $post_id );
				break;
		}
	}

	/**
	 * Sets the sortable columns.
	 *
	 * @param array $columns Array with sortable columns.
	 *
	 * @return array The extended array with sortable columns.
	 */
	public function column_sort( array $columns ) {
		$columns[ 'wpseo-' . self::COLUMN_LINKS ]  = 'wpseo-' . self::COLUMN_LINKS;
		$columns[ 'wpseo-' . self::COLUMN_LINKED ] = 'wpseo-' . self::COLUMN_LINKED;

		return $columns;
	}

	/**
	 * Filter out posts that have not been processed yet.
	 *
	 * @param array $post_ids Post IDs to filter.
	 *
	 * @return array
	 */
	protected function filter_unprocessed_posts( $post_ids ) {
		global $wpdb;

		$post_ids = array_filter( $post_ids );
		if ( empty( $post_ids ) || array() === $post_ids ) {
			return $post_ids;
		}

		$query = $wpdb->prepare(
			'SELECT post_id FROM ' . $wpdb->postmeta . ' WHERE post_id IN (' . implode( ',', $post_ids ) . ') AND meta_key = "%s"',
			WPSEO_Link_Factory::get_index_meta_key()
		);

		$results = $wpdb->get_results( $query, ARRAY_A );

		return array_map( 'intval', wp_list_pluck( $results, 'post_id' ) );
	}
}