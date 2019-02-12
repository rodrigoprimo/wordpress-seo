/* External dependencies */
import analysis from "yoastseo";
const { removeMarks } = analysis.markers;

/* Internal dependencies */
import { updateReplacementVariable } from "../redux/actions/snippetEditor";
import {
	excerptFromContent,
	fillReplacementVariables,
	mapCustomFields,
	mapCustomTaxonomies,
} from "../helpers/replacementVariableHelpers";
import tmceHelper, { tmceId } from "../wp-seo-tinymce";
import debounce from "lodash/debounce";

/**
 * Represents the classic editor data.
 */
class ClassicEditorData {
	/**
	 * Sets the wp data, Yoast SEO refresh function and data object.
	 *
	 * @param {Function} refresh          The YoastSEO refresh function.
	 * @param {Object} store              The YoastSEO Redux store.
	 * @param {Object} settings           The settings for this classic editor data
	 *                                    object.
	 * @param {string} settings.tinyMceId The ID of the tinyMCE editor.
	 *
	 * @returns {void}
	 */
	constructor( refresh, store, settings = { tinyMceId: "" } ) {
		this._refresh = refresh;
		this._store = store;
		this._initialData = {};
		// This will be used for the comparison whether the title, description and slug are dirty.
		this._previousData = {};
		this._settings = settings;
		this.updateReplacementData = this.updateReplacementData.bind( this );
		this.refreshYoastSEO = this.refreshYoastSEO.bind( this );
	}

	/**
	 * Initializes the class by filling this._initialData and subscribing to relevant elements.
	 *
	 * @param {Object} replaceVars The replacement variables passed in the wp-seo-post-scraper args.
	 *
	 * @returns {void}
	 */
	initialize( replaceVars ) {
		this._initialData = this.getInitialData( replaceVars );
		fillReplacementVariables( this._initialData, this._store );
		this.subscribeToElements();
		this.subscribeToStore();
	}

	/**
	 * Gets the title from the document.
	 *
	 * @returns {string} The title or an empty string.
	 */
	getTitle() {
		const titleElement = document.getElementById( "title" );
		return titleElement && titleElement.value || "";
	}

	/**
	 * Gets the excerpt from the document.
	 *
	 * @param {boolean} useFallBack Whether the fallback for content should be used.
	 *
	 * @returns {string} The excerpt.
	 */
	getExcerpt( useFallBack = true ) {
		const excerptElement = document.getElementById( "excerpt" );
		const excerptValue   = excerptElement && excerptElement.value || "";

		if ( excerptValue !== "" || useFallBack === false ) {
			return excerptValue;
		}

		return excerptFromContent( this.getContent() );
	}

	/**
	 * Gets the slug from the document.
	 *
	 * @returns {string} The slug or an empty string.
	 */
	getSlug() {
		let slug = "";

		const newPostSlug = document.getElementById( "new-post-slug" );

		if ( newPostSlug ) {
			slug = newPostSlug.value;
		} else if ( document.getElementById( "editable-post-name-full" ) !== null ) {
			slug = document.getElementById( "editable-post-name-full" ).textContent;
		}

		return slug;
	}

	/**
	 * Gets the content of the document after removing marks.
	 *
	 * @returns {string} The content of the document.
	 */
	getContent() {
		let tinyMceId = this._settings.tinyMceId;

		if ( tinyMceId === "" ) {
			tinyMceId = tmceId;
		}

		return removeMarks( tmceHelper.getContentTinyMce( tinyMceId ) );
	}

	/**
	 * Subscribes to input elements.
	 *
	 * @returns {void}
	 */
	subscribeToElements() {
		this.subscribeToInputElement( "title", "title" );
		this.subscribeToInputElement( "excerpt", "excerpt" );
		this.subscribeToInputElement( "excerpt", "excerpt_only" );
	}

	/**
	 * Subscribes to an element via its id, and sets a callback.
	 *
	 * @param {string}  elementId       The id of the element to subscribe to.
	 * @param {string}  targetField     The name of the field the value should be sent to.
	 *
	 * @returns {void}
	 */
	subscribeToInputElement( elementId, targetField ) {
		const element = document.getElementById( elementId );

		/*
		 * On terms some elements don't exist in the DOM, such as the title element.
		 * We return early if the element was not found.
		 */
		if ( ! element ) {
			return;
		}

		element.addEventListener( "input", ( event ) => {
			this.updateReplacementData( event, targetField );
		} );
	}

	/**
	 * Sets the event target value in the data and dispatches to the store.
	 *
	 * @param {Object} event            An event object.
	 * @param {string} targetReplaceVar The replacevar the event's value belongs to.
	 *
	 * @returns {void}
	 */
	updateReplacementData( event, targetReplaceVar ) {
		let replaceValue = event.target.value;

		if ( targetReplaceVar === "excerpt" && replaceValue === "" ) {
			replaceValue = this.getExcerpt();
		}

		this._initialData[ targetReplaceVar ] = replaceValue;

		this._store.dispatch( updateReplacementVariable( targetReplaceVar, replaceValue ) );
	}

	/**
	 * Checks whether the current data and the data from the updated state are the same.
	 *
	 * @param {Object} currentData The current data.
	 * @param {Object} newData     The data from the updated state.
	 * @returns {boolean}          Whether the current data and the newData is the same.
	 */
	isShallowEqual( currentData, newData ) {
		if ( Object.keys( currentData ).length !== Object.keys( newData ).length ) {
			return false;
		}

		for ( const dataPoint in currentData ) {
			if ( currentData.hasOwnProperty( dataPoint ) ) {
				if ( ! ( dataPoint in newData ) || currentData[ dataPoint ] !== newData[ dataPoint ] ) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * Refreshes YoastSEO's app when the data is dirty.
	 *
	 * @returns {void}
	 */
	refreshYoastSEO() {
		const newData = this.getData();

		// Set isDirty to true if the current data and editor data are unequal.
		const isDirty = ! this.isShallowEqual( this._previousData, newData );

		if ( isDirty ) {
			this.handleEditorChange( newData );
			this._previousData = newData;
			if ( window.YoastSEO && window.YoastSEO.app ) {
				window.YoastSEO.app.refresh();
			}
		}
	}

	/**
	 * Updates the redux store with the changed data.
	 *
	 * @param {Object} newData The changed data.
	 *
	 * @returns {void}
	 */
	handleEditorChange( newData ) {
		// Handle excerpt change
		if ( this._previousData.excerpt !== newData.excerpt ) {
			this._store.dispatch( updateReplacementVariable( "excerpt", newData.excerpt ) );
			this._store.dispatch( updateReplacementVariable( "excerpt_only", newData.excerpt_only ) );
		}
	}

	/**
	 * Listens to the store.
	 *
	 * @returns {void}
	 */
	subscribeToStore() {
		this.subscriber = debounce( this.refreshYoastSEO, 500 );
		this._store.subscribe(
			this.subscriber
		);
	}

	/**
	 * Gets the initial data from the replacevars and document.
	 *
	 * @param {Object} replaceVars The replaceVars object.
	 *
	 * @returns {Object} The data.
	 */
	getInitialData( replaceVars ) {
		replaceVars = mapCustomFields( replaceVars, this._store );
		replaceVars = mapCustomTaxonomies( replaceVars, this._store );

		return {
			...replaceVars,
			title: this.getTitle(),
			excerpt: this.getExcerpt(),
			// eslint-disable-next-line
			excerpt_only: this.getExcerpt( false ),
			slug: this.getSlug(),
			content: this.getContent(),
		};
	}

	/**
	 * Add the latest content to the data object, and return the data object.
	 *
	 * @returns {Object} The data.
	 */
	getData() {
		return {
			...this._store.getState().snippetEditor.data,
			content: this.getContent(),
			excerpt: this.getExcerpt(),
			// eslint-disable-next-line
			excerpt_only: this.getExcerpt( false ),
		};
	}
}
module.exports = ClassicEditorData;
