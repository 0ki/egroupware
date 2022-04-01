/**
 * EGroupware eTemplate2 - InvokerMixing
 *
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package api
 * @link https://www.egroupware.org
 * @author Ralf Becker
 */

/* eslint-disable import/no-extraneous-dependencies */
import {css, dedupeMixin, html, render} from '@lion/core';
import {Et2InputWidget} from "../Et2InputWidget/Et2InputWidget";
import {colorsDefStyles} from "../Styles/colorsDefStyles";

/**
 * Invoker mixing adds an invoker button to a widget to trigger some action, e.g.:
 * - searchbox to delete input
 * - url to open url
 * - url-email to open mail compose
 *
 * Inspired by Lion date-picker.
 */
export const Et2InvokerMixin = dedupeMixin((superclass) =>
{
	class Et2Invoker extends Et2InputWidget(superclass)
	{
		/** @type {any} */
		static get properties()
		{
			return {
				_invokerLabel: {
					type: String,
				},
				_invokerTitle: {
					type: String,
				},
				_invokerAction: {
					type: Function,
				}
			};
		}

		static get styles()
		{
			return [
				...super.styles,
				colorsDefStyles,
				css`
				::slotted(input), input, ::slotted(select) {
					background-color: transparent;
					border: none !important;
				}
				.input-group {
					border: 1px solid var(--input-border-color);
				}
				.input-group__suffix{
				}
				.input-group__container {
					align-items: center
				}
				::slotted([slot="suffix"]) {
					width: 12px;
					border: none !important;
					background-color: transparent !important;
				}
				::slotted(:disabled) {cursor: default !important;}
				:host(:hover) ::slotted([slot="suffix"]) {
					cursor: pointer;
				}
			`,
			];
		}

		get slots()
		{
			return {
				...super.slots,
				suffix: () =>
				{
					const renderParent = document.createElement('div');
					render(
						this._invokerTemplate(),
						renderParent
					);
					return /** @type {HTMLElement} */ (renderParent.firstElementChild);
				},
			};
		}

		/**
		 * @protected
		 */
		get _invokerNode()
		{
			return /** @type {HTMLElement} */ (this.querySelector(`#${this.__invokerId}`));
		}

		constructor()
		{
			super();
			/** @private */
			this.__invokerId = this.__createUniqueIdForA11y();
			// default for properties
			this._invokerTitle = 'Click to open';
		}

		/** @private */
		__createUniqueIdForA11y()
		{
			return `${this.localName}-${Math.random().toString(36).substr(2, 10)}`;
		}

		/**
		 * @param {PropertyKey} name
		 * @param {?} oldValue
		 */
		requestUpdate(name, oldValue)
		{
			super.requestUpdate(name, oldValue);

			if (name === 'disabled' || name === 'showsFeedbackFor' || name === 'modelValue')
			{
				this._toggleInvokerDisabled();
			}

			if (name === '_invokerLabel' || name === '_invokerTitle')
			{
				this._toggleInvoker();
			}
			if (name === '_invokerAction')
			{
				if (oldValue) this._invokerNode?.removeEventListener('click', oldValue);
				this._invokerNode?.addEventListener('click', this._invokerAction.bind(this), true);
			}
		}

		/**
		 * (Un)Hide invoker, if no label or action defined
		 *
		 * @protected
		 * */
		_toggleInvoker()
		{
			if (this._invokerNode)
			{
				this._invokerNode.style.display = !this._invokerLabel ? 'none' : 'inline-block';
				this._invokerNode.innerHTML = this._invokerLabel || '';
				this._invokerNode.title = this._invokerTitle || '';
			}
		}

		/**
		 * Method to check if invoker can be activated: not disabled, empty or invalid
		 *
		 * @protected
		 * */
		_toggleInvokerDisabled()
		{
			if (this._invokerNode)
			{
				const invokerNode = /** @type {HTMLElement & {disabled: boolean}} */ (this._invokerNode);
				invokerNode.disabled = this.disabled || this._isEmpty() || this.hasFeedbackFor.length > 0;
			}
		}

		/** @param {import('@lion/core').PropertyValues } changedProperties */
		firstUpdated(changedProperties)
		{
			super.firstUpdated(changedProperties);
			this._toggleInvokerDisabled();
			this._toggleInvoker();
		}

		/**
		 * Subclassers can replace this with their custom extension invoker,
		 * like `<my-button><calendar-icon></calendar-icon></my-button>`
		 */
		// eslint-disable-next-line class-methods-use-this
		_invokerTemplate()
		{
			return html`
                <button
                        type="button"
                        @click="${this._invokerAction}"
                        id="${this.__invokerId}"
                        aria-label="${this._invokerTitle}"
                        title="${this._invokerTitle}"
                >
                    ${this._invokerLabel}
                </button>
			`;
		}
	}
	return Et2Invoker;
})